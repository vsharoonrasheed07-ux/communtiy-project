import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { guardianMessageSchema } from '@/lib/validators';
import { sanitizeText } from '@/lib/sanitize';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  const auth = await requireApiAuth([Role.GUARDIAN, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const where = user.role === Role.GUARDIAN ? { guardianUserId: user.id } : {};

  const children = await prisma.student.findMany({
    where,
    include: {
      class: {
        select: {
          name: true,
          teacher: { select: { id: true, name: true, phone: true } },
        },
      },
      attendance: {
        orderBy: { date: 'desc' },
        take: 30,
        select: { id: true, date: true, status: true },
      },
      guardianMessages: {
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { name: true, role: true } } },
      },
    },
  });

  return NextResponse.json({ children });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth([Role.GUARDIAN, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const parsed = guardianMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid message' },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: parsed.data.studentId },
      include: { class: { select: { teacherId: true } } },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (user.role === Role.GUARDIAN && student.guardianUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const message = await prisma.guardianMessage.create({
      data: {
        studentId: student.id,
        senderId: user.id,
        senderRole: user.role,
        channel: 'PORTAL',
        body: sanitizeText(parsed.data.body),
      },
      include: { sender: { select: { name: true, role: true } } },
    });

    if (student.class.teacherId) {
      await prisma.notification.create({
        data: {
          userId: student.class.teacherId,
          studentId: student.id,
          type: 'GUARDIAN_REPLY',
          title: `Guardian message for ${student.firstName} ${student.lastName}`,
          message: sanitizeText(parsed.data.body).slice(0, 140),
        },
      });
    }

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'GuardianMessage',
      entityId: message.id,
      details: { studentId: student.id },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to send reply' }, { status: 400 });
  }
}
