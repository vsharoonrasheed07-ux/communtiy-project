import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireApiAuth } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth([Role.ADMIN]);
  if (auth.error) return auth.error;

  const action = request.nextUrl.searchParams.get('action') || '';
  const entityType = request.nextUrl.searchParams.get('entityType') || '';
  const limit = Math.min(200, Math.max(10, Number(request.nextUrl.searchParams.get('limit') || 100)));

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { name: true, email: true, role: true } },
    },
  });

  return NextResponse.json({ logs });
}
