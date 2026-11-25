import { NextRequest, NextResponse } from 'next/server';
import { CaseStage, Role } from '@prisma/client';
import { requireApiAuth, canAssignOrEscalateCase, canLogFollowUp } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { caseUpdateSchema } from '@/lib/validators';
import { sanitizeOptionalText } from '@/lib/sanitize';
import { writeAuditLog } from '@/lib/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const existing = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      student: { include: { class: { select: { teacherId: true } } } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  if (
    !canLogFollowUp(user, existing.student.class.teacherId, existing.assignedToId)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = caseUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid case update' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    if (d.assignedToId !== undefined && d.assignedToId !== existing.assignedToId) {
      if (!canAssignOrEscalateCase(user.role)) {
        return NextResponse.json(
          { error: 'Only Principal or Admin can reassign cases' },
          { status: 403 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      lastActionAt: new Date(),
    };

    if (d.stage !== undefined) {
      updateData.stage = d.stage;
      if (d.stage === CaseStage.RESOLVED) {
        updateData.resolvedAt = new Date();
      } else {
        updateData.resolvedAt = null;
      }
    }
    if (d.assignedToId !== undefined) updateData.assignedToId = d.assignedToId;
    if (d.escalatedToPrincipal !== undefined) {
      updateData.escalatedToPrincipal = d.escalatedToPrincipal;
      updateData.escalatedAt = d.escalatedToPrincipal ? new Date() : null;
    }
    if (d.dropoutReason !== undefined) updateData.dropoutReason = d.dropoutReason;
    if (d.supportGiven !== undefined) updateData.supportGiven = sanitizeOptionalText(d.supportGiven);
    if (d.notes !== undefined) updateData.notes = sanitizeOptionalText(d.notes);

    const updatedCase = await prisma.case.update({
      where: { id: params.id },
      data: updateData,
    });

    // Keep student status synchronized with stage & re-enrolment
    const studentUpdate: Record<string, unknown> = {};
    if (d.dropoutReason !== undefined) studentUpdate.dropoutReason = d.dropoutReason;
    if (d.supportGiven !== undefined)
      studentUpdate.supportGiven = sanitizeOptionalText(d.supportGiven);

    if (d.stage === CaseStage.DROPPED_OUT) {
      studentUpdate.isDroppedOut = true;
    } else if (d.stage === CaseStage.RESOLVED) {
      if (existing.student.isDroppedOut || d.reEnrolled) {
        studentUpdate.isDroppedOut = false;
        studentUpdate.reEnrolled = true;
        studentUpdate.reEnrolledAt = new Date();
      }
    }
    if (d.reEnrolled === true) {
      studentUpdate.isDroppedOut = false;
      studentUpdate.reEnrolled = true;
      studentUpdate.reEnrolledAt = new Date();
    }

    if (Object.keys(studentUpdate).length > 0) {
      await prisma.student.update({
        where: { id: existing.studentId },
        data: studentUpdate,
      });
    }

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'UPDATE',
      entityType: 'Case',
      entityId: params.id,
      details: { stage: d.stage, escalated: d.escalatedToPrincipal, assignedToId: d.assignedToId },
    });

    return NextResponse.json({ case: updatedCase });
  } catch {
    return NextResponse.json({ error: 'Unable to update case' }, { status: 400 });
  }
}
