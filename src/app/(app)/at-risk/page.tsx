'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { StatusBadge, riskLevelToVariant, caseStageToVariant } from '@/components/StatusBadge';

interface AtRiskStudent {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  wardVillage: string;
  attendanceRate: number;
  consecutiveAbsences: number;
  averageMarks: number;
  riskScore: number;
  riskLevel: string;
  riskReasons: Array<{ key: string; label: string; points: number }>;
  class: { name: string };
  cases: Array<{ id: string; stage: string; escalatedToPrincipal: boolean }>;
}

export default function AtRiskPage() {
  const t = useTranslations();
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/students')
      .then((r) => {
        if (!r.ok) throw new Error('Failed');
        return r.json();
      })
      .then((data) => {
        const sorted = ((data.students || []) as AtRiskStudent[])
          .filter((s) => s.riskScore > 0)
          .sort((a, b) => b.riskScore - a.riskScore);
        setStudents(sorted);
      })
      .catch(() => setError('Could not load at-risk students.'))
      .finally(() => setLoading(false));
  }, []);

  const visible = students.filter((s) => {
    if (levelFilter === 'HIGH') return s.riskLevel === 'HIGH';
    if (levelFilter === 'MEDIUM') return s.riskLevel === 'MEDIUM';
    return s.riskLevel === 'HIGH' || s.riskLevel === 'MEDIUM';
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('nav.atRisk')}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Students ranked highest-to-lowest by dropout risk score with contributing reasons.
          </p>
        </div>

        <div className="flex gap-1.5" role="group" aria-label="Filter risk tier">
          {(['ALL', 'HIGH', 'MEDIUM'] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevelFilter(lvl)}
              className={`min-h-[40px] rounded-full px-4 text-xs font-medium ${
                levelFilter === lvl
                  ? 'bg-primary text-white'
                  : 'border border-[#D4D0C5] bg-white text-ink hover:bg-[#FAF9F5]'
              }`}
            >
              {lvl === 'ALL' ? 'High & Medium' : lvl}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="card bg-[#F3CDC2] p-4 text-sm font-medium text-[#8F3A2A]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card p-10 text-center text-sm text-muted">{t('app.loading')}</div>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          No students in this risk tier right now.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <div key={s.id} className="card flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/students/${s.id}`}
                    className="text-base font-medium text-ink hover:text-[#1F6F61] hover:underline"
                  >
                    {s.firstName} {s.lastName}
                  </Link>
                  <span className="text-xs text-muted">
                    {s.class.name} · {s.wardVillage}
                  </span>
                  <StatusBadge variant={riskLevelToVariant(s.riskLevel)}>
                    Score {s.riskScore}/100
                  </StatusBadge>
                  {s.cases[0] && (
                    <StatusBadge variant={caseStageToVariant(s.cases[0].stage)}>
                      {t(`stages.${s.cases[0].stage}`)}
                    </StatusBadge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {Array.isArray(s.riskReasons) &&
                    s.riskReasons.map((r) => (
                      <span
                        key={r.key}
                        className="rounded-lg bg-[#FAF9F5] border border-[#E0DDD2] px-2.5 py-1 text-xs text-ink"
                      >
                        {r.label} <span className="text-[#8F3A2A]">+{r.points}</span>
                      </span>
                    ))}
                </div>

                <p className="text-xs text-muted">
                  Attendance: {s.attendanceRate}% · Consecutive absences: {s.consecutiveAbsences} · Avg marks: {s.averageMarks}%
                </p>
              </div>

              <Link href={`/students/${s.id}`} className="btn-primary shrink-0 text-xs">
                <span>Open Profile & Log Follow-up</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
