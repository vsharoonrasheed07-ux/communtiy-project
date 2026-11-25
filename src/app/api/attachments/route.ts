import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth, canEditStudentRecord } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { sanitizeOptionalText, sanitizeText } from '@/lib/sanitize';
import { writeAuditLog } from '@/lib/audit';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const studentId = String(formData.get('studentId') || '');
    const followUpIdRaw = formData.get('followUpId');
    const followUpId = followUpIdRaw ? String(followUpIdRaw) : null;
    const caption = sanitizeOptionalText(
      formData.get('caption') ? String(formData.get('caption')) : null
    );

    if (!studentId) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, WebP images or PDF documents are allowed' },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File must be 2 MB or smaller' }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { class: { select: { teacherId: true } } },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (!canEditStudentRecord(user, { classTeacherId: student.class.teacherId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await prisma.attachment.create({
      data: {
        studentId,
        followUpId,
        uploadedById: user.id,
        fileName: sanitizeText(file.name).slice(0, 120) || 'document',
        mimeType: file.type,
        fileSize: file.size,
        data: buffer,
        caption,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        caption: true,
        createdAt: true,
      },
    });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'Attachment',
      entityId: attachment.id,
      details: { studentId, fileName: attachment.fileName, fileSize: attachment.fileSize },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
  }
}
