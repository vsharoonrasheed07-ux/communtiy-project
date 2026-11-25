import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth, canEditStudentRecord } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { guardianMessageSchema } from '@/lib/validators';
import { sanitizeText } from '@/lib/sanitize';
import { getSmsProvider } from '@/lib/notifications';
import { writeAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
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

    if (!canEditStudentRecord(user, { classTeacherId: student.class.teacherId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cleanBody = sanitizeText(parsed.data.body);
    const msg = await prisma.guardianMessage.create({
      data: {
        studentId: student.id,
        senderId: user.id,
        senderRole: user.role,
        channel: parsed.data.channel,
        body: cleanBody,
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    if ((parsed.data.channel === 'SMS' || parsed.data.channel === 'WHATSAPP') && student.guardianPhone) {
      const sms = getSmsProvider();
      await sms.send({
        to: student.guardianPhone,
        body: cleanBody,
        channel: parsed.data.channel,
        studentId: student.id,
      });
    }

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'GuardianMessage',
      entityId: msg.id,
      details: { studentId: student.id, channel: parsed.data.channel },
    });

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to send message' }, { status: 400 });
  }
}
