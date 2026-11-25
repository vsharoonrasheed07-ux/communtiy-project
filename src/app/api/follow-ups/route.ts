import { NextRequest, NextResponse } from 'next/server';
import { CaseStage, Role } from '@prisma/client';
import { requireApiAuth, canLogFollowUp } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { followUpCreateSchema } from '@/lib/validators';
import { sanitizeOptionalText, sanitizeText } from '@/lib/sanitize';
import { writeAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const parsed = followUpCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const targetCase = await prisma.case.findUnique({
      where: { id: d.caseId },
      include: {
        student: { include: { class: { select: { teacherId: true } } } },
      },
    });

    if (!targetCase || targetCase.studentId !== d.studentId) {
      return NextResponse.json({ error: 'Case not found for student' }, { status: 404 });
    }

    if (
      !canLogFollowUp(user, targetCase.student.class.teacherId, targetCase.assignedToId)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const followUp = await prisma.followUp.create({
      data: {
        caseId: d.caseId,
        studentId: d.studentId,
        authorId: user.id,
        type: d.type,
        outcome: sanitizeText(d.outcome),
        notes: sanitizeText(d.notes),
        nextFollowUpDate: d.nextFollowUpDate ? new Date(d.nextFollowUpDate) : null,
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });

    const caseUpdate: Record<string, unknown> = {
      lastActionAt: new Date(),
    };
    if (d.advanceStage) {
      caseUpdate.stage = d.advanceStage;
      if (d.advanceStage === CaseStage.RESOLVED) {
        caseUpdate.resolvedAt = new Date();
      }
    } else if (targetCase.stage === CaseStage.FLAGGED) {
      caseUpdate.stage =
        d.type === 'HOME_VISIT' ? CaseStage.HOME_VISIT : CaseStage.CONTACTED;
    }

    if (d.dropoutReason !== undefined) caseUpdate.dropoutReason = d.dropoutReason;
    if (d.supportGiven !== undefined)
      caseUpdate.supportGiven = sanitizeOptionalText(d.supportGiven);

    await prisma.case.update({
      where: { id: d.caseId },
      data: caseUpdate,
    });

    if (d.dropoutReason !== undefined || d.supportGiven !== undefined || d.advanceStage === CaseStage.DROPPED_OUT) {
      const studentUpdate: Record<string, unknown> = {};
      if (d.dropoutReason !== undefined) studentUpdate.dropoutReason = d.dropoutReason;
      if (d.supportGiven !== undefined)
        studentUpdate.supportGiven = sanitizeOptionalText(d.supportGiven);
      if (d.advanceStage === CaseStage.DROPPED_OUT) {
        studentUpdate.isDroppedOut = true;
      } else if (d.advanceStage === CaseStage.RESOLVED && targetCase.student.isDroppedOut) {
        studentUpdate.isDroppedOut = false;
        studentUpdate.reEnrolled = true;
        studentUpdate.reEnrolledAt = new Date();
      }
      await prisma.student.update({
        where: { id: d.studentId },
        data: studentUpdate,
      });
    }

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'FollowUp',
      entityId: followUp.id,
      details: { caseId: d.caseId, studentId: d.studentId, type: d.type },
    });

    return NextResponse.json({ followUp }, { status: 201 });
  } catch (error) {
    console.error('Follow-up create error:', error);
    return NextResponse.json({ error: 'Failed to log follow-up' }, { status: 400 });
  }
}
