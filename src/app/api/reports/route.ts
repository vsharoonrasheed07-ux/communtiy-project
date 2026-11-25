import { NextRequest, NextResponse } from 'next/server';
import { CaseStage, Role } from '@prisma/client';
import { requireApiAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { csvEscape } from '@/lib/sanitize';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const format = request.nextUrl.searchParams.get('format');
  const studentScope =
    user.role === Role.TEACHER ? { class: { teacherId: user.id } } : {};

  const [students, classes, attendance90, cases] = await Promise.all([
    prisma.student.findMany({
      where: studentScope,
      include: { class: { select: { id: true, name: true } } },
    }),
    prisma.class.findMany({
      where: user.role === Role.TEACHER ? { teacherId: user.id } : {},
      include: {
        teacher: { select: { name: true } },
        _count: { select: { students: true } },
      },
      orderBy: [{ grade: 'asc' }, { section: 'asc' }],
    }),
    prisma.attendance.findMany({
      where: {
        student: studentScope,
      },
      select: {
        date: true,
        status: true,
        student: { select: { classId: true } },
      },
    }),
    prisma.case.findMany({
      where:
        user.role === Role.TEACHER
          ? { student: { class: { teacherId: user.id } } }
          : {},
      select: {
        stage: true,
        dropoutReason: true,
        openedAt: true,
        resolvedAt: true,
      },
    }),
  ]);

  if (format === 'csv') {
    const header = [
      'AdmissionNo',
      'FirstName',
      'LastName',
      'Class',
      'WardVillage',
      'RiskScore',
      'RiskLevel',
      'AttendanceRatePct',
      'ConsecutiveAbsences',
      'DropoutReason',
      'ReEnrolled',
      'SupportGiven',
    ];
    const rows = students.map((s) =>
      [
        s.admissionNo,
        s.firstName,
        s.lastName,
        s.class.name,
        s.wardVillage,
        s.riskScore,
        s.riskLevel,
        s.attendanceRate,
        s.consecutiveAbsences,
        s.dropoutReason || '',
        s.reEnrolled ? 'Yes' : 'No',
        s.supportGiven || '',
      ]
        .map(csvEscape)
        .join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'EXPORT',
      entityType: 'Report',
      details: { format: 'csv', studentCount: students.length },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="stayinschool-report.csv"',
      },
    });
  }

  // Dropout reasons breakdown
  const reasonCounts = new Map<string, number>();
  for (const s of students) {
    if (s.dropoutReason) {
      reasonCounts.set(s.dropoutReason, (reasonCounts.get(s.dropoutReason) || 0) + 1);
    }
  }
  for (const c of cases) {
    if (c.dropoutReason && !reasonCounts.has(c.dropoutReason)) {
      reasonCounts.set(c.dropoutReason, 1);
    }
  }
  const dropoutReasons = Array.from(reasonCounts.entries()).map(([reason, count]) => ({
    reason,
    count,
  }));

  // Class-wise attendance
  const classAttendance = classes.map((cls) => {
    const classStudents = students.filter((s) => s.classId === cls.id);
    const avgAttendance =
      classStudents.length > 0
        ? Number(
            (
              classStudents.reduce((sum, s) => sum + s.attendanceRate, 0) /
              classStudents.length
            ).toFixed(1)
          )
        : 100;
    const highRiskCount = classStudents.filter((s) => s.riskLevel === 'HIGH').length;
    return {
      classId: cls.id,
      className: cls.name,
      teacherName: cls.teacher?.name || 'Unassigned',
      studentCount: classStudents.length,
      avgAttendance,
      highRiskCount,
    };
  });

  // Monthly attendance & absence trends
  const monthMap = new Map<string, { present: number; absent: number; late: number; total: number }>();
  for (const rec of attendance90) {
    const monthKey = rec.date.toISOString().slice(0, 7); // YYYY-MM
    const m = monthMap.get(monthKey) || { present: 0, absent: 0, late: 0, total: 0 };
    m.total += 1;
    if (rec.status === 'PRESENT') m.present += 1;
    else if (rec.status === 'ABSENT') m.absent += 1;
    else m.late += 1;
    monthMap.set(monthKey, m);
  }
  const monthlyTrends = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({
      month,
      attendanceRate: m.total > 0 ? Number((((m.present + m.late) / m.total) * 100).toFixed(1)) : 100,
      absentCount: m.absent,
      totalRecords: m.total,
    }));

  // Ward / Village heatmap table for district officers
  const wardMap = new Map<
    string,
    {
      ward: string;
      totalStudents: number;
      highRisk: number;
      mediumRisk: number;
      droppedOut: number;
      reEnrolled: number;
      attendanceSum: number;
    }
  >();

  for (const s of students) {
    const entry = wardMap.get(s.wardVillage) || {
      ward: s.wardVillage,
      totalStudents: 0,
      highRisk: 0,
      mediumRisk: 0,
      droppedOut: 0,
      reEnrolled: 0,
      attendanceSum: 0,
    };
    entry.totalStudents += 1;
    if (s.riskLevel === 'HIGH') entry.highRisk += 1;
    if (s.riskLevel === 'MEDIUM') entry.mediumRisk += 1;
    if (s.isDroppedOut) entry.droppedOut += 1;
    if (s.reEnrolled) entry.reEnrolled += 1;
    entry.attendanceSum += s.attendanceRate;
    wardMap.set(s.wardVillage, entry);
  }

  const wardHeatmap = Array.from(wardMap.values())
    .map((w) => ({
      ...w,
      avgAttendance:
        w.totalStudents > 0 ? Number((w.attendanceSum / w.totalStudents).toFixed(1)) : 100,
    }))
    .sort((a, b) => b.highRisk - a.highRisk);

  const reEnrolledStudents = students
    .filter((s) => s.reEnrolled)
    .map((s) => ({
      id: s.id,
      admissionNo: s.admissionNo,
      name: `${s.firstName} ${s.lastName}`,
      className: s.class.name,
      wardVillage: s.wardVillage,
      dropoutReason: s.dropoutReason,
      supportGiven: s.supportGiven,
      reEnrolledAt: s.reEnrolledAt,
      attendanceRate: s.attendanceRate,
    }));

  const resolvedCasesCount = cases.filter((c) => c.stage === CaseStage.RESOLVED).length;

  return NextResponse.json({
    summary: {
      totalStudents: students.length,
      highRisk: students.filter((s) => s.riskLevel === 'HIGH').length,
      droppedOut: students.filter((s) => s.isDroppedOut).length,
      reEnrolled: reEnrolledStudents.length,
      resolvedCases: resolvedCasesCount,
    },
    dropoutReasons,
    classAttendance,
    monthlyTrends,
    wardHeatmap,
    reEnrolledStudents,
  });
}
