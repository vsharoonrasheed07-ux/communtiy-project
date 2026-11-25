import { NextRequest, NextResponse } from 'next/server';
import { CaseStage, RiskLevel, Role } from '@prisma/client';
import { requireApiAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const filter = request.nextUrl.searchParams.get('filter') || 'ALL';

  const studentScope =
    user.role === Role.TEACHER ? { class: { teacherId: user.id } } : {};
  const caseScope =
    user.role === Role.TEACHER
      ? {
          OR: [{ assignedToId: user.id }, { student: { class: { teacherId: user.id } } }],
        }
      : {};

  const [
    totalStudents,
    highRiskCount,
    openCasesCount,
    reEnrolledCount,
    pipelineGroups,
    notifications,
  ] = await Promise.all([
    prisma.student.count({ where: studentScope }),
    prisma.student.count({
      where: { ...studentScope, riskLevel: RiskLevel.HIGH, isDroppedOut: false },
    }),
    prisma.case.count({
      where: {
        ...caseScope,
        stage: { in: [CaseStage.FLAGGED, CaseStage.CONTACTED, CaseStage.HOME_VISIT] },
      },
    }),
    prisma.student.count({
      where: { ...studentScope, reEnrolled: true },
    }),
    prisma.case.groupBy({
      by: ['stage'],
      where: caseScope,
      _count: { id: true },
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  const pipeline: Record<CaseStage, number> = {
    FLAGGED: 0,
    CONTACTED: 0,
    HOME_VISIT: 0,
    RESOLVED: 0,
    DROPPED_OUT: 0,
  };
  for (const g of pipelineGroups) {
    pipeline[g.stage] = g._count.id;
  }

  // Needs follow-up today list
  let followUpWhere: Record<string, unknown> = { ...studentScope };
  if (filter === 'HIGH') {
    followUpWhere = { ...studentScope, riskLevel: RiskLevel.HIGH };
  } else if (filter === 'MEDIUM') {
    followUpWhere = { ...studentScope, riskLevel: RiskLevel.MEDIUM };
  } else if (filter === 'LOW') {
    followUpWhere = { ...studentScope, riskLevel: RiskLevel.LOW };
  } else if (filter === 'RESOLVED') {
    followUpWhere = {
      ...studentScope,
      cases: { some: { stage: CaseStage.RESOLVED } },
    };
  } else {
    followUpWhere = {
      ...studentScope,
      OR: [
        { riskLevel: { in: [RiskLevel.HIGH, RiskLevel.MEDIUM] } },
        { cases: { some: { stage: { in: [CaseStage.FLAGGED, CaseStage.CONTACTED, CaseStage.HOME_VISIT] } } } },
      ],
    };
  }

  const followUpStudents = await prisma.student.findMany({
    where: followUpWhere,
    orderBy: [{ riskScore: 'desc' }, { consecutiveAbsences: 'desc' }],
    take: 15,
    include: {
      class: { select: { id: true, name: true } },
      cases: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        include: {
          followUps: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  // 14-day absence trend
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - 13);

  const recentAttendance = await prisma.attendance.findMany({
    where: {
      date: { gte: startDate, lte: today },
      student: studentScope,
    },
    select: { date: true, status: true },
  });

  const dayMap = new Map<string, { absent: number; total: number }>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(startDate);
    d.setUTCDate(startDate.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { absent: 0, total: 0 });
  }

  for (const rec of recentAttendance) {
    const key = rec.date.toISOString().slice(0, 10);
    const bucket = dayMap.get(key);
    if (bucket) {
      bucket.total += 1;
      if (rec.status === 'ABSENT') {
        bucket.absent += 1;
      }
    }
  }

  const absenceTrend = Array.from(dayMap.entries()).map(([date, val]) => ({
    date,
    absentCount: val.absent,
    totalMarked: val.total,
    absenceRate: val.total > 0 ? Number(((val.absent / val.total) * 100).toFixed(1)) : 0,
  }));

  return NextResponse.json({
    summary: {
      totalStudents,
      highRisk: highRiskCount,
      openCases: openCasesCount,
      reEnrolled: reEnrolledCount,
    },
    pipeline,
    absenceTrend,
    followUpList: followUpStudents.map((s) => ({
      id: s.id,
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      className: s.class.name,
      riskScore: s.riskScore,
      riskLevel: s.riskLevel,
      riskReasons: s.riskReasons,
      attendanceRate: s.attendanceRate,
      consecutiveAbsences: s.consecutiveAbsences,
      latestCase: s.cases[0]
        ? {
            id: s.cases[0].id,
            stage: s.cases[0].stage,
            escalatedToPrincipal: s.cases[0].escalatedToPrincipal,
            lastActionAt: s.cases[0].lastActionAt,
            nextFollowUpDate: s.cases[0].followUps[0]?.nextFollowUpDate ?? null,
          }
        : null,
    })),
    notifications,
  });
}

export async function PATCH() {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;

  await prisma.notification.updateMany({
    where: { userId: auth.user.id, isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true });
}
