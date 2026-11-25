import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import {
  canAccessPage,
  canAssignOrEscalateCase,
  canManageSettings,
  canMarkClassAttendance,
  canViewAuditLogs,
  canViewStudentRecord,
} from '@/lib/rbac';

describe('Role-based access checks', () => {
  it('restricts Teachers to their own class for viewing students and marking attendance', () => {
    const teacher = { id: 'teacher-1', role: Role.TEACHER };
    expect(canViewStudentRecord(teacher, { classTeacherId: 'teacher-1' })).toBe(true);
    expect(canViewStudentRecord(teacher, { classTeacherId: 'teacher-2' })).toBe(false);
    expect(canMarkClassAttendance(teacher, 'teacher-1')).toBe(true);
    expect(canMarkClassAttendance(teacher, 'teacher-2')).toBe(false);
  });

  it('allows Principal across the school for cases/students, but restricts Settings & Audit Log to Admin', () => {
    const principal = { id: 'principal-1', role: Role.PRINCIPAL };
    expect(canViewStudentRecord(principal, { classTeacherId: 'teacher-2' })).toBe(true);
    expect(canAssignOrEscalateCase(Role.PRINCIPAL)).toBe(true);
    expect(canAssignOrEscalateCase(Role.TEACHER)).toBe(false);
    expect(canManageSettings(Role.PRINCIPAL)).toBe(false);
    expect(canViewAuditLogs(Role.PRINCIPAL)).toBe(false);
    expect(canManageSettings(Role.ADMIN)).toBe(true);
    expect(canViewAuditLogs(Role.ADMIN)).toBe(true);
  });

  it('scopes Guardians strictly to their own linked child and /guardian route', () => {
    const guardian = { id: 'guard-1', role: Role.GUARDIAN };
    expect(canViewStudentRecord(guardian, { guardianUserId: 'guard-1' })).toBe(true);
    expect(canViewStudentRecord(guardian, { guardianUserId: 'guard-2' })).toBe(false);
    expect(canAccessPage(Role.GUARDIAN, '/guardian')).toBe(true);
    expect(canAccessPage(Role.GUARDIAN, '/dashboard')).toBe(false);
    expect(canAccessPage(Role.GUARDIAN, '/students')).toBe(false);
  });
});
