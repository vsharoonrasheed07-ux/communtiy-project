import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { riskSettingsSchema } from '@/lib/validators';
import { getRiskRulesConfig, recalculateStudentRisk } from '@/lib/risk-service';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  const auth = await requireApiAuth([Role.ADMIN]);
  if (auth.error) return auth.error;

  const [riskRules, users, classes] = await Promise.all([
    getRiskRulesConfig(),
    prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        preferredLang: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.class.findMany({
      orderBy: [{ grade: 'asc' }, { section: 'asc' }],
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { students: true } },
      },
    }),
  ]);

  return NextResponse.json({ riskRules, users, classes });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth([Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const parsed = riskSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    if (d.highRiskThreshold <= d.mediumRiskThreshold) {
      return NextResponse.json(
        { error: 'High risk threshold must be greater than medium risk threshold' },
        { status: 400 }
      );
    }

    const updated = await prisma.riskRuleSettings.upsert({
      where: { id: 'default' },
      update: d,
      create: { id: 'default', ...d },
    });

    // Recalculate risk scores across students so updated rules apply immediately
    const students = await prisma.student.findMany({ select: { id: true } });
    for (const s of students) {
      await recalculateStudentRisk(s.id);
    }

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'UPDATE',
      entityType: 'RiskRuleSettings',
      entityId: 'default',
      details: { recalculatedStudents: students.length },
    });

    return NextResponse.json({ riskRules: updated, recalculated: students.length });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Unable to update settings' }, { status: 400 });
  }
}
