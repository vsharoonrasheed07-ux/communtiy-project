import { CaseStage, Prisma, RiskLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  calculateRiskScore,
  computeAttendanceMetrics,
  DEFAULT_RISK_RULES,
  RiskRulesConfig,
} from '@/lib/risk';
import { getSmsProvider } from '@/lib/notifications';

export async function getRiskRulesConfig(): Promise<
  RiskRulesConfig & { smsAlertConsecutiveDays: number; escalationDays: number; defaultLanguage: string }
> {
  const row = await prisma.riskRuleSettings.findUnique({ where: { id: 'default' } });
  if (!row) {
    return {
      ...DEFAULT_RISK_RULES,
      smsAlertConsecutiveDays: 3,
      escalationDays: 7,
      defaultLanguage: 'en',
    };
  }
  return row;
}

/**
 * Recalculates attendance rate, consecutive absences, average marks, risk score & level
 * for a single student. Opens a case & notifies assigned teacher if the student turns HIGH risk,
 * and triggers SMS/WhatsApp alert after >= smsAlertConsecutiveDays consecutive absences.
 */
export async function recalculateStudentRisk(
  studentId: string,
  options?: { sendAbsenceAlert?: boolean }
) {
  const [student, attendance, marks, settings] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: { select: { id: true, name: true, teacherId: true } },
        cases: {
          where: { stage: { in: [CaseStage.FLAGGED, CaseStage.CONTACTED, CaseStage.HOME_VISIT] } },
          orderBy: { openedAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.attendance.findMany({
      where: { studentId },
      orderBy: { date: 'desc' },
      take: 90,
      select: { date: true, status: true },
    }),
    prisma.mark.findMany({
      where: { studentId },
      orderBy: { recordedAt: 'desc' },
      take: 20,
      select: { score: true, maxScore: true },
    }),
    getRiskRulesConfig(),
  ]);

  if (!student) return null;

  const { attendanceRate, consecutiveAbsences } = computeAttendanceMetrics(attendance);

  const averageMarks =
    marks.length > 0
      ? Number(
          (
            marks.reduce((acc, m) => acc + (m.maxScore > 0 ? (m.score / m.maxScore) * 100 : 0), 0) /
            marks.length
          ).toFixed(1)
        )
      : student.averageMarks;

  const riskResult = calculateRiskScore(
    {
      attendanceRate,
      consecutiveAbsences,
      averageMarks,
      pendingFees: student.pendingFees,
      distanceKm: student.distanceKm,
      flagMigration: student.flagMigration,
      flagHealth: student.flagHealth,
      flagChildLabour: student.flagChildLabour,
      flagEarlyMarriage: student.flagEarlyMarriage,
    },
    settings
  );

  const prevLevel = student.riskLevel;

  const updated = await prisma.student.update({
    where: { id: studentId },
    data: {
      attendanceRate,
      consecutiveAbsences,
      averageMarks,
      riskScore: riskResult.score,
      riskLevel: riskResult.level,
      riskReasons: riskResult.reasons as unknown as Prisma.InputJsonValue,
    },
  });

  // Auto-open case and notify assigned teacher when student turns HIGH risk
  let openedCase = null;
  if (riskResult.level === RiskLevel.HIGH && student.cases.length === 0 && !student.isDroppedOut) {
    const teacherId = student.class.teacherId;
    openedCase = await prisma.case.create({
      data: {
        studentId: student.id,
        stage: CaseStage.FLAGGED,
        assignedToId: teacherId,
        notes: `Auto-flagged: risk score ${riskResult.score}/100 (${riskResult.reasons.map((r) => r.label).join('; ')})`,
      },
    });

    if (teacherId) {
      await prisma.notification.create({
        data: {
          userId: teacherId,
          studentId: student.id,
          caseId: openedCase.id,
          type: 'HIGH_RISK',
          title: `High risk alert: ${student.firstName} ${student.lastName}`,
          message: `${student.firstName} ${student.lastName} (${student.class.name}) reached risk score ${riskResult.score}/100. A follow-up case has been opened.`,
        },
      });
    }
  } else if (prevLevel !== RiskLevel.HIGH && riskResult.level === RiskLevel.HIGH && student.class.teacherId) {
    await prisma.notification.create({
      data: {
        userId: student.class.teacherId,
        studentId: student.id,
        caseId: student.cases[0]?.id ?? null,
        type: 'HIGH_RISK',
        title: `Student turned High risk: ${student.firstName} ${student.lastName}`,
        message: `Risk score rose to ${riskResult.score}/100.`,
      },
    });
  }

  // Send automatic SMS/WhatsApp alert after >= 3 consecutive absences (at most once per 24h)
  if (
    options?.sendAbsenceAlert &&
    consecutiveAbsences >= settings.smsAlertConsecutiveDays &&
    student.guardianPhone
  ) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAlert = await prisma.communicationLog.findFirst({
      where: {
        studentId: student.id,
        channel: { in: ['SMS', 'WHATSAPP'] },
        createdAt: { gte: yesterday },
      },
    });

    if (!recentAlert) {
      const sms = getSmsProvider();
      const body = `StayInSchool Alert: ${student.firstName} ${student.lastName} has been absent for ${consecutiveAbsences} consecutive school days. Please contact ${student.class.name} teacher or reply in the Guardian Portal.`;
      await sms.send({
        to: student.guardianPhone,
        body,
        channel: 'SMS',
        studentId: student.id,
      });
      await sms.send({
        to: student.guardianPhone,
        body,
        channel: 'WHATSAPP',
        studentId: student.id,
      });
    }
  }

  return { student: updated, riskResult, openedCase };
}
