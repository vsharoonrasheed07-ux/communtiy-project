import { NextRequest, NextResponse } from 'next/server';
import { CaseStage, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getRiskRulesConfig, recalculateStudentRisk } from '@/lib/risk-service';
import { getEmailProvider } from '@/lib/notifications';
import { writeAuditLog } from '@/lib/audit';

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-cron-secret');

  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

async function handleCron(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
  }

  const now = new Date();
  const settings = await getRiskRulesConfig();

  // 1. Recalculate risk scores for all active students
  const students = await prisma.student.findMany({
    where: { isDroppedOut: false },
    select: { id: true },
  });

  let recalculated = 0;
  let autoOpenedCases = 0;
  for (const s of students) {
    const res = await recalculateStudentRisk(s.id);
    if (res) {
      recalculated += 1;
      if (res.openedCase) autoOpenedCases += 1;
    }
  }

  // 2. Create overdue follow-up reminders
  const overdueFollowUps = await prisma.followUp.findMany({
    where: {
      nextFollowUpDate: { lt: now },
      reminderSent: false,
      case: {
        stage: { in: [CaseStage.FLAGGED, CaseStage.CONTACTED, CaseStage.HOME_VISIT] },
      },
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, class: { select: { teacherId: true } } } },
      case: { select: { id: true, assignedToId: true } },
    },
  });

  let remindersCreated = 0;
  for (const fu of overdueFollowUps) {
    const targetUserId = fu.case.assignedToId || fu.student.class.teacherId;
    if (targetUserId) {
      await prisma.notification.create({
        data: {
          userId: targetUserId,
          studentId: fu.student.id,
          caseId: fu.case.id,
          type: 'OVERDUE_FOLLOWUP',
          title: `Overdue follow-up: ${fu.student.firstName} ${fu.student.lastName}`,
          message: `Scheduled follow-up (${fu.type}) was due on ${fu.nextFollowUpDate?.toISOString().slice(0, 10)}.`,
        },
      });
      remindersCreated += 1;
    }
    await prisma.followUp.update({
      where: { id: fu.id },
      data: { reminderSent: true },
    });
  }

  // 3. Escalate stale cases after N days (default 7) with no action
  const escalationCutoff = new Date(
    now.getTime() - settings.escalationDays * 24 * 60 * 60 * 1000
  );
  const staleCases = await prisma.case.findMany({
    where: {
      stage: { in: [CaseStage.FLAGGED, CaseStage.CONTACTED, CaseStage.HOME_VISIT] },
      escalatedToPrincipal: false,
      lastActionAt: { lt: escalationCutoff },
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
    },
  });

  const principals = await prisma.user.findMany({
    where: { role: Role.PRINCIPAL, isActive: true },
    select: { id: true, email: true, name: true },
  });

  let escalatedCount = 0;
  for (const c of staleCases) {
    await prisma.case.update({
      where: { id: c.id },
      data: {
        escalatedToPrincipal: true,
        escalatedAt: now,
      },
    });
    escalatedCount += 1;

    for (const p of principals) {
      await prisma.notification.create({
        data: {
          userId: p.id,
          studentId: c.student.id,
          caseId: c.id,
          type: 'ESCALATION',
          title: `Escalated case: ${c.student.firstName} ${c.student.lastName}`,
          message: `No follow-up action for ${settings.escalationDays}+ days in ${c.student.class.name}.`,
        },
      });
    }
  }

  // 4. Weekly summary email digest for Principals (Mondays or ?digest=true)
  let digestsSent = 0;
  const forceDigest = request.nextUrl.searchParams.get('digest') === 'true';
  if (now.getUTCDay() === 1 || forceDigest) {
    const [totalStudents, highRisk, openCases, reEnrolled] = await Promise.all([
      prisma.student.count(),
      prisma.student.count({ where: { riskLevel: 'HIGH', isDroppedOut: false } }),
      prisma.case.count({
        where: { stage: { in: [CaseStage.FLAGGED, CaseStage.CONTACTED, CaseStage.HOME_VISIT] } },
      }),
      prisma.student.count({ where: { reEnrolled: true } }),
    ]);

    const emailProvider = getEmailProvider();
    for (const p of principals) {
      await emailProvider.send({
        to: p.email,
        subject: `StayInSchool Weekly Digest (${now.toISOString().slice(0, 10)})`,
        body: `Hello ${p.name},\n\nWeekly School Retention Summary:\n- Total Students: ${totalStudents}\n- High Risk Students: ${highRisk}\n- Open Follow-up Cases: ${openCases}\n- Escalated Cases Today: ${escalatedCount}\n- Re-enrolled Students: ${reEnrolled}\n\nPlease review escalated cases in StayInSchool.`,
      });
      digestsSent += 1;
    }
  }

  await writeAuditLog({
    action: 'CRON',
    entityType: 'DailyCron',
    details: {
      recalculated,
      autoOpenedCases,
      remindersCreated,
      escalatedCount,
      digestsSent,
    },
  });

  return NextResponse.json({
    ok: true,
    recalculated,
    autoOpenedCases,
    remindersCreated,
    escalatedCount,
    digestsSent,
  });
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
