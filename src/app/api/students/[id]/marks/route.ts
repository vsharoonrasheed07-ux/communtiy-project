import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth, canEditStudentRecord } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { markCreateSchema } from '@/lib/validators';
import { sanitizeText } from '@/lib/sanitize';
import { recalculateStudentRisk } from '@/lib/risk-service';
import { writeAuditLog } from '@/lib/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const student = await prisma.student.findUnique({
    where: { id: params.id },
    include: { class: { select: { teacherId: true } } },
  });

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  if (!canEditStudentRecord(user, { classTeacherId: student.class.teacherId })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = markCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const mark = await prisma.mark.create({
      data: {
        studentId: params.id,
        subject: sanitizeText(parsed.data.subject),
        examName: sanitizeText(parsed.data.examName),
        score: parsed.data.score,
        maxScore: parsed.data.maxScore,
      },
    });

    await recalculateStudentRisk(params.id);

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'Mark',
      entityId: mark.id,
      details: { studentId: params.id, subject: mark.subject, score: mark.score },
    });

    return NextResponse.json({ mark }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to record mark' }, { status: 400 });
  }
}
