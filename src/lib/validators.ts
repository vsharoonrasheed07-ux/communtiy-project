import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const studentCreateSchema = z.object({
  admissionNo: z.string().trim().min(2, 'Admission number is required').max(32),
  firstName: z.string().trim().min(1, 'First name is required').max(64),
  lastName: z.string().trim().min(1, 'Last name is required').max(64),
  gender: z.enum(['Female', 'Male', 'Other']).default('Female'),
  dateOfBirth: z.string().optional().nullable(),
  classId: z.string().min(1, 'Class is required'),
  wardVillage: z.string().trim().min(1, 'Ward / Village is required').max(120),
  address: z.string().trim().max(255).optional().nullable(),
  guardianName: z.string().trim().min(1, 'Guardian name is required').max(120),
  guardianPhone: z.string().trim().min(7, 'Valid guardian phone is required').max(24),
  guardianRelation: z.string().trim().max(40).default('Parent'),
  pendingFees: z.boolean().default(false),
  distanceKm: z.coerce.number().min(0).max(100).default(1),
  flagMigration: z.boolean().default(false),
  flagHealth: z.boolean().default(false),
  flagChildLabour: z.boolean().default(false),
  flagEarlyMarriage: z.boolean().default(false),
  averageMarks: z.coerce.number().min(0).max(100).optional(),
  isDroppedOut: z.boolean().optional(),
  reEnrolled: z.boolean().optional(),
  dropoutReason: z
    .enum(['FEES', 'MIGRATION', 'WORK', 'MARRIAGE', 'HEALTH', 'DISTANCE', 'NO_INTEREST', 'OTHER'])
    .optional()
    .nullable(),
  supportGiven: z.string().max(500).optional().nullable(),
});

export const studentUpdateSchema = studentCreateSchema.partial();

export const attendanceBatchSchema = z.object({
  classId: z.string().min(1, 'Class ID is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  syncedFromOffline: z.boolean().optional().default(false),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
        notes: z.string().max(250).optional().nullable(),
      })
    )
    .min(1, 'At least one attendance entry is required'),
});

export const caseUpdateSchema = z.object({
  stage: z.enum(['FLAGGED', 'CONTACTED', 'HOME_VISIT', 'RESOLVED', 'DROPPED_OUT']).optional(),
  assignedToId: z.string().nullable().optional(),
  escalatedToPrincipal: z.boolean().optional(),
  dropoutReason: z
    .enum(['FEES', 'MIGRATION', 'WORK', 'MARRIAGE', 'HEALTH', 'DISTANCE', 'NO_INTEREST', 'OTHER'])
    .nullable()
    .optional(),
  supportGiven: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  reEnrolled: z.boolean().optional(),
});

export const followUpCreateSchema = z.object({
  caseId: z.string().min(1, 'Case ID is required'),
  studentId: z.string().min(1, 'Student ID is required'),
  type: z.enum(['CALL', 'SMS', 'WHATSAPP', 'HOME_VISIT', 'COUNSELLING']),
  outcome: z.string().trim().min(2, 'Outcome is required').max(200),
  notes: z.string().trim().min(2, 'Notes are required').max(1500),
  nextFollowUpDate: z.string().optional().nullable(),
  advanceStage: z
    .enum(['FLAGGED', 'CONTACTED', 'HOME_VISIT', 'RESOLVED', 'DROPPED_OUT'])
    .optional(),
  dropoutReason: z
    .enum(['FEES', 'MIGRATION', 'WORK', 'MARRIAGE', 'HEALTH', 'DISTANCE', 'NO_INTEREST', 'OTHER'])
    .nullable()
    .optional(),
  supportGiven: z.string().max(500).nullable().optional(),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100),
  role: z.enum(['TEACHER', 'PRINCIPAL', 'ADMIN', 'GUARDIAN']),
  phone: z.string().trim().max(24).optional().nullable(),
  preferredLang: z.enum(['en', 'hi', 'kn']).default('en'),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['TEACHER', 'PRINCIPAL', 'ADMIN', 'GUARDIAN']).optional(),
  phone: z.string().trim().max(24).optional().nullable(),
  preferredLang: z.enum(['en', 'hi', 'kn']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(100).optional(),
});

export const classCreateSchema = z.object({
  name: z.string().trim().min(2).max(40),
  grade: z.coerce.number().int().min(1).max(12),
  section: z.string().trim().min(1).max(10),
  academicYear: z.string().trim().min(4).max(16).default('2026-27'),
  teacherId: z.string().nullable().optional(),
});

export const riskSettingsSchema = z.object({
  attendanceThresholdPct: z.coerce.number().int().min(10).max(99),
  attendancePoints: z.coerce.number().int().min(0).max(100),
  consecutiveAbsenceDays: z.coerce.number().int().min(1).max(30),
  consecutiveAbsencePoints: z.coerce.number().int().min(0).max(100),
  failingMarksThresholdPct: z.coerce.number().int().min(10).max(90),
  failingMarksPoints: z.coerce.number().int().min(0).max(100),
  pendingFeesPoints: z.coerce.number().int().min(0).max(100),
  longDistanceKm: z.coerce.number().min(0.5).max(50),
  longDistancePoints: z.coerce.number().int().min(0).max(100),
  migrationPoints: z.coerce.number().int().min(0).max(100),
  healthPoints: z.coerce.number().int().min(0).max(100),
  childLabourPoints: z.coerce.number().int().min(0).max(100),
  earlyMarriagePoints: z.coerce.number().int().min(0).max(100),
  mediumRiskThreshold: z.coerce.number().int().min(1).max(99),
  highRiskThreshold: z.coerce.number().int().min(2).max(100),
  smsAlertConsecutiveDays: z.coerce.number().int().min(1).max(14),
  escalationDays: z.coerce.number().int().min(1).max(30),
  defaultLanguage: z.enum(['en', 'hi', 'kn']),
});

export const guardianMessageSchema = z.object({
  studentId: z.string().min(1),
  body: z.string().trim().min(1, 'Message cannot be empty').max(1000),
  channel: z.enum(['PORTAL', 'SMS', 'WHATSAPP']).default('PORTAL'),
});

export const markCreateSchema = z.object({
  subject: z.string().trim().min(1).max(60),
  examName: z.string().trim().min(1).max(60),
  score: z.coerce.number().min(0).max(1000),
  maxScore: z.coerce.number().min(1).max(1000).default(100),
});
