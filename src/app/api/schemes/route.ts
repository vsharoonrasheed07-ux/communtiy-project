import { NextResponse } from 'next/server';
import { RiskLevel, Role } from '@prisma/client';
import { requireApiAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { matchSchemesForStudent } from '@/lib/schemes';

export async function GET() {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const studentScope =
    user.role === Role.TEACHER ? { class: { teacherId: user.id } } : {};

  const students = await prisma.student.findMany({
    where: {
      ...studentScope,
      OR: [
        { riskLevel: { in: [RiskLevel.HIGH, RiskLevel.MEDIUM] } },
        { pendingFees: true },
        { distanceKm: { gte: 3 } },
        { flagMigration: true },
        { flagHealth: true },
        { flagChildLabour: true },
        { flagEarlyMarriage: true },
      ],
    },
    orderBy: [{ riskScore: 'desc' }],
    include: {
      class: { select: { name: true } },
    },
  });

  const matches = students
    .map((s) => {
      const schemes = matchSchemesForStudent({
        pendingFees: s.pendingFees,
        distanceKm: s.distanceKm,
        flagMigration: s.flagMigration,
        flagHealth: s.flagHealth,
        flagChildLabour: s.flagChildLabour,
        flagEarlyMarriage: s.flagEarlyMarriage,
        attendanceRate: s.attendanceRate,
        averageMarks: s.averageMarks,
        gender: s.gender,
        dropoutReason: s.dropoutReason,
      });
      return {
        student: {
          id: s.id,
          admissionNo: s.admissionNo,
          firstName: s.firstName,
          lastName: s.lastName,
          className: s.class.name,
          riskScore: s.riskScore,
          riskLevel: s.riskLevel,
          dropoutReason: s.dropoutReason,
          supportGiven: s.supportGiven,
        },
        schemes,
      };
    })
    .filter((m) => m.schemes.length > 0);

  return NextResponse.json({ matches });
}
