import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { userUpdateSchema } from '@/lib/validators';
import { sanitizeOptionalText, sanitizeText } from '@/lib/sanitize';
import { writeAuditLog } from '@/lib/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiAuth([Role.ADMIN]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const parsed = userUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid update' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (d.name !== undefined) updateData.name = sanitizeText(d.name);
    if (d.role !== undefined) updateData.role = d.role;
    if (d.phone !== undefined) updateData.phone = sanitizeOptionalText(d.phone);
    if (d.preferredLang !== undefined) updateData.preferredLang = d.preferredLang;
    if (d.isActive !== undefined) updateData.isActive = d.isActive;
    if (d.password !== undefined) updateData.passwordHash = await hashPassword(d.password);

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        preferredLang: true,
        isActive: true,
      },
    });

    await writeAuditLog({
      userId: auth.user.id,
      userEmail: auth.user.email,
      userRole: auth.user.role,
      action: 'UPDATE',
      entityType: 'User',
      entityId: params.id,
      details: { fields: Object.keys(updateData) },
    });

    return NextResponse.json({ user: updated });
  } catch {
    return NextResponse.json({ error: 'Unable to update user' }, { status: 400 });
  }
}
