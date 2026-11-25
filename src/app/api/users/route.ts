import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { userCreateSchema } from '@/lib/validators';
import { sanitizeOptionalText, sanitizeText } from '@/lib/sanitize';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  const auth = await requireApiAuth([Role.ADMIN]);
  if (auth.error) return auth.error;

  const users = await prisma.user.findMany({
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
  });

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth([Role.ADMIN]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const parsed = userCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid user data' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const passwordHash = await hashPassword(d.password);
    const created = await prisma.user.create({
      data: {
        name: sanitizeText(d.name),
        email: d.email.toLowerCase(),
        passwordHash,
        role: d.role,
        phone: sanitizeOptionalText(d.phone),
        preferredLang: d.preferredLang,
      },
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
      action: 'CREATE',
      entityType: 'User',
      entityId: created.id,
      details: { email: created.email, role: created.role },
    });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Could not create user (email may exist)' }, { status: 400 });
  }
}
