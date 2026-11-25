import { NextResponse } from 'next/server';
import { CaseStage, RiskLevel, Role } from '@prisma/client';
import { requireApiAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.error) return auth.error;
  const { user } = auth;

  if (user.role === Role.GUARDIAN) {
    return NextResponse.json({
      user,
      counts: { students: 0, atRisk: 0, openCases: 0, unreadNotifications: 0 },
    });
  }

  const studentScope =
    user.role === Role.TEACHER ? { class: { teacherId: user.id } } : {};
  const caseScope =
    user.role === Role.TEACHER
      ? {
          OR: [{ assignedToId: user.id }, { student: { class: { teacherId: user.id } } }],
        }
      : {};

  const [students, atRisk, openCases, unreadNotifications] = await Promise.all([
    prisma.student.count({ where: studentScope }),
    prisma.student.count({
      where: {
        ...studentScope,
        riskLevel: { in: [RiskLevel.HIGH, RiskLevel.MEDIUM] },
        isDroppedOut: false,
      },
    }),
    prisma.case.count({
      where: {
        ...caseScope,
        stage: { in: [CaseStage.FLAGGED, CaseStage.CONTACTED, CaseStage.HOME_VISIT] },
      },
    }),
    prisma.notification.count({
      where: { userId: user.id, isRead: false },
    }),
  ]);

  return NextResponse.json({
    user,
    counts: { students, atRisk, openCases, unreadNotifications },
  });
}
