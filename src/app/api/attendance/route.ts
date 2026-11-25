import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth, canMarkClassAttendance } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { attendanceBatchSchema } from '@/lib/validators';
import { sanitizeOptionalText } from '@/lib/sanitize';
import { recalculateStudentRisk } from '@/lib/risk-service';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const classId = request.nextUrl.searchParams.get('classId');
  const dateStr = request.nextUrl.searchParams.get('date');

  if (!classId || !dateStr) {
    return NextResponse.json({ error: 'classId and date are required' }, { status: 400 });
  }

  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }

  if (!canMarkClassAttendance(user, cls.teacherId)) {
    return NextResponse.json({ error: 'Forbidden for this class' }, { status: 403 });
  }

  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const students = await prisma.student.findMany({
    where: { classId, isDroppedOut: false },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      riskLevel: true,
      riskScore: true,
      consecutiveAbsences: true,
      attendance: {
        where: { date: targetDate },
        take: 1,
        select: { status: true, notes: true, syncedFromOffline: true },
      },
    },
  });

  return NextResponse.json({
    class: cls,
    date: dateStr,
    students: students.map((s) => ({
      id: s.id,
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      riskLevel: s.riskLevel,
      riskScore: s.riskScore,
      consecutiveAbsences: s.consecutiveAbsences,
      status: s.attendance[0]?.status ?? 'PRESENT',
      hasExistingRecord: s.attendance.length > 0,
      notes: s.attendance[0]?.notes ?? '',
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const parsed = attendanceBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const { classId, date, syncedFromOffline, entries } = parsed.data;
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    if (!canMarkClassAttendance(user, cls.teacherId)) {
      return NextResponse.json(
        { error: 'Teachers can only mark attendance for their assigned class' },
        { status: 403 }
      );
    }

    const targetDate = new Date(`${date}T00:00:00.000Z`);

    // Verify all students belong to the specified class
    const classStudents = await prisma.student.findMany({
      where: { classId },
      select: { id: true },
    });
    const allowedIds = new Set(classStudents.map((s) => s.id));
    const validEntries = entries.filter((e) => allowedIds.has(e.studentId));

    await prisma.$transaction(
      validEntries.map((entry) =>
        prisma.attendance.upsert({
          where: {
            studentId_date: {
              studentId: entry.studentId,
              date: targetDate,
            },
          },
          update: {
            status: entry.status,
            markedById: user.id,
            syncedFromOffline,
            notes: sanitizeOptionalText(entry.notes),
          },
          create: {
            studentId: entry.studentId,
            date: targetDate,
            status: entry.status,
            markedById: user.id,
            syncedFromOffline,
            notes: sanitizeOptionalText(entry.notes),
          },
        })
      )
    );

    // Recalculate risk scores and trigger auto-case + 3-day SMS/WhatsApp alerts
    const alertsTriggered: string[] = [];
    for (const entry of validEntries) {
      const res = await recalculateStudentRisk(entry.studentId, { sendAbsenceAlert: true });
      if (res?.openedCase) {
        alertsTriggered.push(entry.studentId);
      }
    }

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'Attendance',
      entityId: classId,
      details: {
        date,
        count: validEntries.length,
        syncedFromOffline,
        autoOpenedCases: alertsTriggered.length,
      },
    });

    return NextResponse.json({
      saved: validEntries.length,
      autoOpenedCases: alertsTriggered.length,
    });
  } catch (error) {
    console.error('Attendance save error:', error);
    return NextResponse.json({ error: 'Unable to save attendance' }, { status: 500 });
  }
}
