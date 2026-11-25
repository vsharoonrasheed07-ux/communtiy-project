import { Prisma, Role } from '@prisma/client';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export interface AuditInput {
  userId?: string | null;
  userEmail?: string | null;
  userRole?: Role | null;
  action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGIN_FAILED' | 'EXPORT' | 'CRON';
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

export function getClientIp(): string {
  try {
    const hdrs = headers();
    const forwarded = hdrs.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return hdrs.get('x-real-ip') || 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function writeAuditLog(entry: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        userEmail: entry.userEmail ?? null,
        userRole: entry.userRole ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        details: (entry.details ?? {}) as Prisma.InputJsonValue,
        ipAddress: getClientIp(),
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
