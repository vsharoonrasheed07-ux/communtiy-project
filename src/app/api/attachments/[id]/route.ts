import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth, canViewStudentRecord } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN, Role.GUARDIAN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  const attachment = await prisma.attachment.findUnique({
    where: { id: params.id },
    include: {
      student: {
        select: {
          guardianUserId: true,
          class: { select: { teacherId: true } },
        },
      },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  if (
    !canViewStudentRecord(user, {
      classTeacherId: attachment.student.class.teacherId,
      guardianUserId: attachment.student.guardianUserId,
    })
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return new NextResponse(new Uint8Array(attachment.data), {
    status: 200,
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${attachment.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
