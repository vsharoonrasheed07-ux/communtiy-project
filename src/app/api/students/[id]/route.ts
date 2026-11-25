import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth, canEditStudentRecord, canViewStudentRecord } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { studentUpdateSchema } from '@/lib/validators';
import { sanitizeOptionalText, sanitizeText } from '@/lib/sanitize';
import { recalculateStudentRisk } from '@/lib/risk-service';
import { matchSchemesForStudent } from '@/lib/schemes';
import { writeAuditLog } from '@/lib/audit';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN, Role.GUARDIAN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const student = await prisma.student.findUnique({
    where: { id: params.id },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          grade: true,
          section: true,
          teacherId: true,
          teacher: { select: { id: true, name: true, email: true } },
        },
      },
      attendance: {
        orderBy: { date: 'desc' },
        take: 60,
        select: { id: true, date: true, status: true, syncedFromOffline: true, notes: true },
      },
      marks: {
        orderBy: { recordedAt: 'desc' },
      },
      cases: {
        orderBy: { openedAt: 'desc' },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          followUps: {
            orderBy: { createdAt: 'desc' },
            include: {
              author: { select: { id: true, name: true, role: true } },
              attachments: {
                select: { id: true, fileName: true, mimeType: true, fileSize: true, caption: true, createdAt: true },
              },
            },
          },
        },
      },
      followUps: {
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, name: true, role: true } },
          attachments: {
            select: { id: true, fileName: true, mimeType: true, fileSize: true, caption: true, createdAt: true },
          },
        },
      },
      attachments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          caption: true,
          followUpId: true,
          createdAt: true,
        },
      },
      guardianMessages: {
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { id: true, name: true, role: true } } },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  if (
    !canViewStudentRecord(user, {
      classTeacherId: student.class.teacherId,
      guardianUserId: student.guardianUserId,
    })
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const matchedSchemes = matchSchemesForStudent({
    pendingFees: student.pendingFees,
    distanceKm: student.distanceKm,
    flagMigration: student.flagMigration,
    flagHealth: student.flagHealth,
    flagChildLabour: student.flagChildLabour,
    flagEarlyMarriage: student.flagEarlyMarriage,
    attendanceRate: student.attendanceRate,
    averageMarks: student.averageMarks,
    gender: student.gender,
    dropoutReason: student.dropoutReason,
  });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'VIEW',
    entityType: 'Student',
    entityId: student.id,
    details: { admissionNo: student.admissionNo },
  });

  return NextResponse.json({ student, matchedSchemes });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const existing = await prisma.student.findUnique({
    where: { id: params.id },
    include: { class: { select: { teacherId: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  if (!canEditStudentRecord(user, { classTeacherId: existing.class.teacherId })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = studentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (d.admissionNo !== undefined) updateData.admissionNo = sanitizeText(d.admissionNo);
    if (d.firstName !== undefined) updateData.firstName = sanitizeText(d.firstName);
    if (d.lastName !== undefined) updateData.lastName = sanitizeText(d.lastName);
    if (d.gender !== undefined) updateData.gender = d.gender;
    if (d.dateOfBirth !== undefined)
      updateData.dateOfBirth = d.dateOfBirth ? new Date(d.dateOfBirth) : null;
    if (d.classId !== undefined) updateData.classId = d.classId;
    if (d.wardVillage !== undefined) updateData.wardVillage = sanitizeText(d.wardVillage);
    if (d.address !== undefined) updateData.address = sanitizeOptionalText(d.address);
    if (d.guardianName !== undefined) updateData.guardianName = sanitizeText(d.guardianName);
    if (d.guardianPhone !== undefined) updateData.guardianPhone = sanitizeText(d.guardianPhone);
    if (d.guardianRelation !== undefined)
      updateData.guardianRelation = sanitizeText(d.guardianRelation);
    if (d.pendingFees !== undefined) updateData.pendingFees = d.pendingFees;
    if (d.distanceKm !== undefined) updateData.distanceKm = d.distanceKm;
    if (d.flagMigration !== undefined) updateData.flagMigration = d.flagMigration;
    if (d.flagHealth !== undefined) updateData.flagHealth = d.flagHealth;
    if (d.flagChildLabour !== undefined) updateData.flagChildLabour = d.flagChildLabour;
    if (d.flagEarlyMarriage !== undefined) updateData.flagEarlyMarriage = d.flagEarlyMarriage;
    if (d.averageMarks !== undefined) updateData.averageMarks = d.averageMarks;
    if (d.isDroppedOut !== undefined) updateData.isDroppedOut = d.isDroppedOut;
    if (d.reEnrolled !== undefined) {
      updateData.reEnrolled = d.reEnrolled;
      if (d.reEnrolled && !existing.reEnrolled) {
        updateData.reEnrolledAt = new Date();
        updateData.isDroppedOut = false;
      }
    }
    if (d.dropoutReason !== undefined) updateData.dropoutReason = d.dropoutReason;
    if (d.supportGiven !== undefined) updateData.supportGiven = sanitizeOptionalText(d.supportGiven);

    await prisma.student.update({
      where: { id: params.id },
      data: updateData,
    });

    await recalculateStudentRisk(params.id);

    const updated = await prisma.student.findUnique({
      where: { id: params.id },
      include: { class: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'UPDATE',
      entityType: 'Student',
      entityId: params.id,
      details: { updatedFields: Object.keys(updateData) },
    });

    return NextResponse.json({ student: updated });
  } catch {
    return NextResponse.json({ error: 'Unable to update student' }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiAuth([Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const existing = await prisma.student.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  await prisma.student.delete({ where: { id: params.id } });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'DELETE',
    entityType: 'Student',
    entityId: params.id,
    details: { admissionNo: existing.admissionNo },
  });

  return NextResponse.json({ ok: true });
}
