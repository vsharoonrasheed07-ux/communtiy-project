import { RiskLevel } from '@prisma/client';

export interface RiskRulesConfig {
  attendanceThresholdPct: number;
  attendancePoints: number;
  consecutiveAbsenceDays: number;
  consecutiveAbsencePoints: number;
  failingMarksThresholdPct: number;
  failingMarksPoints: number;
  pendingFeesPoints: number;
  longDistanceKm: number;
  longDistancePoints: number;
  migrationPoints: number;
  healthPoints: number;
  childLabourPoints: number;
  earlyMarriagePoints: number;
  mediumRiskThreshold: number;
  highRiskThreshold: number;
}

export const DEFAULT_RISK_RULES: RiskRulesConfig = {
  attendanceThresholdPct: 75,
  attendancePoints: 30,
  consecutiveAbsenceDays: 5,
  consecutiveAbsencePoints: 25,
  failingMarksThresholdPct: 35,
  failingMarksPoints: 15,
  pendingFeesPoints: 10,
  longDistanceKm: 3.0,
  longDistancePoints: 10,
  migrationPoints: 10,
  healthPoints: 10,
  childLabourPoints: 10,
  earlyMarriagePoints: 10,
  mediumRiskThreshold: 35,
  highRiskThreshold: 65,
};

export interface RiskReason {
  key: string;
  label: string;
  points: number;
}

export interface RiskInput {
  attendanceRate: number;
  consecutiveAbsences: number;
  averageMarks: number;
  pendingFees: boolean;
  distanceKm: number;
  flagMigration: boolean;
  flagHealth: boolean;
  flagChildLabour: boolean;
  flagEarlyMarriage: boolean;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  reasons: RiskReason[];
}

/**
 * Computes a student's dropout risk score (0-100), risk level, and contributing reasons
 * using configurable rule thresholds and point weights.
 */
export function calculateRiskScore(
  input: RiskInput,
  rules: RiskRulesConfig = DEFAULT_RISK_RULES
): RiskResult {
  let rawScore = 0;
  const reasons: RiskReason[] = [];

  if (input.attendanceRate < rules.attendanceThresholdPct) {
    rawScore += rules.attendancePoints;
    reasons.push({
      key: 'low_attendance',
      label: `Attendance below ${rules.attendanceThresholdPct}% (${Math.round(input.attendanceRate)}%)`,
      points: rules.attendancePoints,
    });
  }

  if (input.consecutiveAbsences >= rules.consecutiveAbsenceDays) {
    rawScore += rules.consecutiveAbsencePoints;
    reasons.push({
      key: 'consecutive_absences',
      label: `${input.consecutiveAbsences} consecutive absences (>= ${rules.consecutiveAbsenceDays} days)`,
      points: rules.consecutiveAbsencePoints,
    });
  }

  if (input.averageMarks < rules.failingMarksThresholdPct) {
    rawScore += rules.failingMarksPoints;
    reasons.push({
      key: 'failing_marks',
      label: `Failing marks (${Math.round(input.averageMarks)}% < ${rules.failingMarksThresholdPct}%)`,
      points: rules.failingMarksPoints,
    });
  }

  if (input.pendingFees) {
    rawScore += rules.pendingFeesPoints;
    reasons.push({
      key: 'pending_fees',
      label: 'Pending school fees',
      points: rules.pendingFeesPoints,
    });
  }

  if (input.distanceKm >= rules.longDistanceKm) {
    rawScore += rules.longDistancePoints;
    reasons.push({
      key: 'long_distance',
      label: `Long distance from school (${input.distanceKm.toFixed(1)} km)`,
      points: rules.longDistancePoints,
    });
  }

  if (input.flagMigration) {
    rawScore += rules.migrationPoints;
    reasons.push({
      key: 'migration',
      label: 'Seasonal family migration flag',
      points: rules.migrationPoints,
    });
  }

  if (input.flagHealth) {
    rawScore += rules.healthPoints;
    reasons.push({
      key: 'health',
      label: 'Health concern flag',
      points: rules.healthPoints,
    });
  }

  if (input.flagChildLabour) {
    rawScore += rules.childLabourPoints;
    reasons.push({
      key: 'child_labour',
      label: 'Child labour risk flag',
      points: rules.childLabourPoints,
    });
  }

  if (input.flagEarlyMarriage) {
    rawScore += rules.earlyMarriagePoints;
    reasons.push({
      key: 'early_marriage',
      label: 'Early marriage risk flag',
      points: rules.earlyMarriagePoints,
    });
  }

  const score = Math.min(100, Math.max(0, rawScore));
  let level: RiskLevel = RiskLevel.LOW;
  if (score >= rules.highRiskThreshold) {
    level = RiskLevel.HIGH;
  } else if (score >= rules.mediumRiskThreshold) {
    level = RiskLevel.MEDIUM;
  }

  return { score, level, reasons };
}

export interface AttendanceRecordLike {
  date: Date | string;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
}

/**
 * Computes overall attendance percentage and consecutive absences from the most recent date.
 */
export function computeAttendanceMetrics(records: AttendanceRecordLike[]): {
  attendanceRate: number;
  consecutiveAbsences: number;
} {
  if (records.length === 0) {
    return { attendanceRate: 100, consecutiveAbsences: 0 };
  }

  const sorted = [...records].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let attended = 0;
  for (const r of sorted) {
    if (r.status === 'PRESENT' || r.status === 'LATE') {
      attended += 1;
    }
  }
  const attendanceRate = Number(((attended / sorted.length) * 100).toFixed(1));

  let consecutiveAbsences = 0;
  for (const r of sorted) {
    if (r.status === 'ABSENT') {
      consecutiveAbsences += 1;
    } else {
      break;
    }
  }

  return { attendanceRate, consecutiveAbsences };
}
