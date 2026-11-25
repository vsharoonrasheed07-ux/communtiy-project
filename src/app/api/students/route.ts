import { NextRequest, NextResponse } from 'next/server';
import { RiskLevel, Role } from '@prisma/client';
import { requireApiAuth, canEditStudentRecord } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { studentCreateSchema } from '@/lib/validators';
import { sanitizeOptionalText, sanitizeText } from '@/lib/sanitize';
import { recalculateStudentRisk } from '@/lib/risk-service';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const sp = request.nextUrl.searchParams;
  const search = sp.get('search')?.trim() || '';
  const classId = sp.get('classId') || '';
  const riskLevel = sp.get('riskLevel') || '';
  const ward = sp.get('ward') || '';
  const reEnrolledOnly = sp.get('reEnrolled') === 'true';

  const where: Record<string, unknown> = {};

  if (user.role === Role.TEACHER) {
    where.class = { teacherId: user.id };
  }
  if (classId) {
    where.classId = classId;
  }
  if (riskLevel && ['LOW', 'MEDIUM', 'HIGH'].includes(riskLevel)) {
    where.riskLevel = riskLevel as RiskLevel;
  }
  if (ward) {
    where.wardVillage = ward;
  }
  if (reEnrolledOnly) {
    where.reEnrolled = true;
  }
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { admissionNo: { contains: search, mode: 'insensitive' } },
      { guardianName: { contains: search, mode: 'insensitive' } },
      { wardVillage: { contains: search, mode: 'insensitive' } },
    ];
  }

  const students = await prisma.student.findMany({
    where,
    orderBy: [{ riskScore: 'desc' }, { firstName: 'asc' }],
    include: {
      class: { select: { id: true, name: true, grade: true, section: true, teacherId: true } },
      cases: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { id: true, stage: true, escalatedToPrincipal: true },
      },
    },
  });

  return NextResponse.json({ students });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const parsed = studentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const cls = await prisma.class.findUnique({ where: { id: data.classId } });
    if (!cls) {
      return NextResponse.json({ error: 'Selected class not found' }, { status: 404 });
    }

    if (!canEditStudentRecord(user, { classTeacherId: cls.teacherId })) {
      return NextResponse.json(
        { error: 'Teachers can only add students to their own assigned class' },
        { status: 403 }
      );
    }

    const created = await prisma.student.create({
      data: {
        admissionNo: sanitizeText(data.admissionNo),
        firstName: sanitizeText(data.firstName),
        lastName: sanitizeText(data.lastName),
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        classId: data.classId,
        wardVillage: sanitizeText(data.wardVillage),
        address: sanitizeOptionalText(data.address),
        guardianName: sanitizeText(data.guardianName),
        guardianPhone: sanitizeText(data.guardianPhone),
        guardianRelation: sanitizeText(data.guardianRelation),
        pendingFees: data.pendingFees,
        distanceKm: data.distanceKm,
        flagMigration: data.flagMigration,
        flagHealth: data.flagHealth,
        flagChildLabour: data.flagChildLabour,
        flagEarlyMarriage: data.flagEarlyMarriage,
        averageMarks: data.averageMarks ?? 70,
        dropoutReason: data.dropoutReason ?? null,
        supportGiven: sanitizeOptionalText(data.supportGiven),
      },
    });

    await recalculateStudentRisk(created.id);

    const updated = await prisma.student.findUnique({
      where: { id: created.id },
      include: { class: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'Student',
      entityId: created.id,
      details: { admissionNo: created.admissionNo, classId: created.classId },
    });

    return NextResponse.json({ student: updated }, { status: 201 });
  } catch (error) {
    console.error('Create student error:', error);
    return NextResponse.json(
      { error: 'Could not create student (ensure admission number is unique)' },
      { status: 400 }
    );
  }
}
