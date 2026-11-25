import { describe, expect, it } from 'vitest';
import { RiskLevel } from '@prisma/client';
import {
  calculateRiskScore,
  computeAttendanceMetrics,
  DEFAULT_RISK_RULES,
} from '@/lib/risk';

describe('calculateRiskScore', () => {
  it('returns LOW risk with 0 points when no risk factors are active', () => {
    const result = calculateRiskScore(
      {
        attendanceRate: 92,
        consecutiveAbsences: 0,
        averageMarks: 78,
        pendingFees: false,
        distanceKm: 1.2,
        flagMigration: false,
        flagHealth: false,
        flagChildLabour: false,
        flagEarlyMarriage: false,
      },
      DEFAULT_RISK_RULES
    );

    expect(result.score).toBe(0);
    expect(result.level).toBe(RiskLevel.LOW);
    expect(result.reasons).toHaveLength(0);
  });

  it('returns MEDIUM risk when attendance < 75% (+30) and pending fees (+10)', () => {
    const result = calculateRiskScore(
      {
        attendanceRate: 70,
        consecutiveAbsences: 2,
        averageMarks: 60,
        pendingFees: true,
        distanceKm: 1.5,
        flagMigration: false,
        flagHealth: false,
        flagChildLabour: false,
        flagEarlyMarriage: false,
      },
      DEFAULT_RISK_RULES
    );

    expect(result.score).toBe(40);
    expect(result.level).toBe(RiskLevel.MEDIUM);
    expect(result.reasons.map((r) => r.key)).toEqual(['low_attendance', 'pending_fees']);
  });

  it('returns HIGH risk at 65+ when attendance < 75%, 5 consecutive absences, and long distance', () => {
    const result = calculateRiskScore(
      {
        attendanceRate: 62,
        consecutiveAbsences: 5,
        averageMarks: 55,
        pendingFees: false,
        distanceKm: 3.5,
        flagMigration: false,
        flagHealth: false,
        flagChildLabour: false,
        flagEarlyMarriage: false,
      },
      DEFAULT_RISK_RULES
    );

    expect(result.score).toBe(65);
    expect(result.level).toBe(RiskLevel.HIGH);
  });

  it('caps total score at 100 even when all risk flags are active', () => {
    const result = calculateRiskScore(
      {
        attendanceRate: 30,
        consecutiveAbsences: 10,
        averageMarks: 20,
        pendingFees: true,
        distanceKm: 8,
        flagMigration: true,
        flagHealth: true,
        flagChildLabour: true,
        flagEarlyMarriage: true,
      },
      DEFAULT_RISK_RULES
    );

    expect(result.score).toBe(100);
    expect(result.level).toBe(RiskLevel.HIGH);
    expect(result.reasons).toHaveLength(9);
  });
});

describe('computeAttendanceMetrics', () => {
  it('counts consecutive absences from most recent day backwards and treats LATE as attended', () => {
    const metrics = computeAttendanceMetrics([
      { date: '2026-11-01', status: 'PRESENT' },
      { date: '2026-11-02', status: 'LATE' },
      { date: '2026-11-03', status: 'ABSENT' },
      { date: '2026-11-04', status: 'ABSENT' },
      { date: '2026-11-05', status: 'ABSENT' },
    ]);

    expect(metrics.attendanceRate).toBe(40);
    expect(metrics.consecutiveAbsences).toBe(3);
  });
});
