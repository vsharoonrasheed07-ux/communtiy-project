import { Role } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getSessionUser, SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const STAFF_ROLES: Role[] = [Role.TEACHER, Role.PRINCIPAL, Role.ADMIN];
const LEADERSHIP_ROLES: Role[] = [Role.PRINCIPAL, Role.ADMIN];

export function isStaffRole(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function canAccessPage(role: Role, pathname: string): boolean {
  if (pathname.startsWith('/guardian')) {
    return role === Role.GUARDIAN || role === Role.ADMIN;
  }
  if (role === Role.GUARDIAN) {
    return pathname === '/guardian' || pathname === '/login';
  }
  if (pathname.startsWith('/settings') || pathname.startsWith('/audit-log')) {
    return role === Role.ADMIN;
  }
  if (pathname.startsWith('/reports')) {
    return LEADERSHIP_ROLES.includes(role) || role === Role.TEACHER;
  }
  return STAFF_ROLES.includes(role);
}

export function canViewStudentRecord(
  user: Pick<SessionUser, 'id' | 'role'>,
  student: { classTeacherId?: string | null; guardianUserId?: string | null }
): boolean {
  if (user.role === Role.ADMIN || user.role === Role.PRINCIPAL) {
    return true;
  }
  if (user.role === Role.TEACHER) {
    return student.classTeacherId === user.id;
  }
  if (user.role === Role.GUARDIAN) {
    return student.guardianUserId === user.id;
  }
  return false;
}

export function canEditStudentRecord(
  user: Pick<SessionUser, 'id' | 'role'>,
  student: { classTeacherId?: string | null }
): boolean {
  if (user.role === Role.ADMIN || user.role === Role.PRINCIPAL) {
    return true;
  }
  if (user.role === Role.TEACHER) {
    return student.classTeacherId === user.id;
  }
  return false;
}

export function canMarkClassAttendance(
  user: Pick<SessionUser, 'id' | 'role'>,
  classTeacherId?: string | null
): boolean {
  if (user.role === Role.ADMIN || user.role === Role.PRINCIPAL) {
    return true;
  }
  if (user.role === Role.TEACHER) {
    return classTeacherId === user.id;
  }
  return false;
}

export function canAssignOrEscalateCase(role: Role): boolean {
  return role === Role.PRINCIPAL || role === Role.ADMIN;
}

export function canLogFollowUp(
  user: Pick<SessionUser, 'id' | 'role'>,
  classTeacherId?: string | null,
  assignedToId?: string | null
): boolean {
  if (user.role === Role.ADMIN || user.role === Role.PRINCIPAL) {
    return true;
  }
  if (user.role === Role.TEACHER) {
    return classTeacherId === user.id || assignedToId === user.id;
  }
  return false;
}

export function canManageSettings(role: Role): boolean {
  return role === Role.ADMIN;
}

export function canViewAuditLogs(role: Role): boolean {
  return role === Role.ADMIN;
}

export async function requireApiAuth(allowedRoles?: Role[]): Promise<
  | { user: SessionUser; error?: never }
  | { user?: never; error: NextResponse }
> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return {
      error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  let dbUser = null;
  try {
    dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, email: true, name: true, role: true, preferredLang: true, isActive: true },
    });
  } catch {
    // If DB is unreachable, trust verified JWT session for demo/offline resilience
    dbUser = {
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name,
      role: sessionUser.role,
      preferredLang: sessionUser.preferredLang,
      isActive: true,
    };
  }

  if (!dbUser || !dbUser.isActive) {
    return {
      error: NextResponse.json({ error: 'Account inactive or not found' }, { status: 401 }),
    };
  }

  if (allowedRoles && !allowedRoles.includes(dbUser.role)) {
    return {
      error: NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 }),
    };
  }

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      preferredLang: dbUser.preferredLang,
    },
  };
}
