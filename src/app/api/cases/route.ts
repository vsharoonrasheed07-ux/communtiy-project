import { NextRequest, NextResponse } from 'next/server';
import { CaseStage, Role } from '@prisma/client';
import { z } from 'zod';
import { requireApiAuth, canEditStudentRecord } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { sanitizeOptionalText } from '@/lib/sanitize';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const where =
    user.role === Role.TEACHER
      ? {
          OR: [{ assignedToId: user.id }, { student: { class: { teacherId: user.id } } }],
        }
      : {};

  const [cases, teachers] = await Promise.all([
    prisma.case.findMany({
      where,
      orderBy: [{ escalatedToPrincipal: 'desc' }, { lastActionAt: 'asc' }],
      include: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            riskScore: true,
            riskLevel: true,
            riskReasons: true,
            consecutiveAbsences: true,
            attendanceRate: true,
            guardianName: true,
            guardianPhone: true,
            wardVillage: true,
            reEnrolled: true,
            class: { select: { id: true, name: true, teacherId: true } },
          },
        },
        assignedTo: { select: { id: true, name: true, role: true } },
        followUps: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: { author: { select: { name: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: [Role.TEACHER, Role.PRINCIPAL] }, isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return NextResponse.json({ cases, staff: teachers });
}

const createCaseSchema = z.object({
  studentId: z.string().min(1),
  notes: z.string().max(1000).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const parsed = createCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid case payload' }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: parsed.data.studentId },
      include: { class: { select: { teacherId: true } } },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (!canEditStudentRecord(user, { classTeacherId: student.class.teacherId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const created = await prisma.case.create({
      data: {
        studentId: student.id,
        stage: CaseStage.FLAGGED,
        assignedToId: parsed.data.assignedToId ?? student.class.teacherId ?? user.id,
        notes: sanitizeOptionalText(parsed.data.notes),
      },
    });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'Case',
      entityId: created.id,
      details: { studentId: student.id },
    });

    return NextResponse.json({ case: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to open case' }, { status: 400 });
  }
}
