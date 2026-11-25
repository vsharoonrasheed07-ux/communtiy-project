'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Bell, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { StatusBadge, riskLevelToVariant, caseStageToVariant } from '@/components/StatusBadge';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface DashboardData {
  summary: {
    totalStudents: number;
    highRisk: number;
    openCases: number;
    reEnrolled: number;
  };
  pipeline: Record<'FLAGGED' | 'CONTACTED' | 'HOME_VISIT' | 'RESOLVED' | 'DROPPED_OUT', number>;
  absenceTrend: Array<{
    date: string;
    absentCount: number;
    totalMarked: number;
    absenceRate: number;
  }>;
  followUpList: Array<{
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    className: string;
    riskScore: number;
    riskLevel: string;
    riskReasons: Array<{ key: string; label: string; points: number }>;
    attendanceRate: number;
    consecutiveAbsences: number;
    latestCase: {
      id: string;
      stage: string;
      escalatedToPrincipal: boolean;
      lastActionAt: string;
      nextFollowUpDate: string | null;
    } | null;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    isRead: boolean;
    studentId: string | null;
    createdAt: string;
  }>;
}

const FILTER_OPTIONS = [
  { key: 'ALL', labelKey: 'all' },
  { key: 'HIGH', labelKey: 'high' },
  { key: 'MEDIUM', labelKey: 'medium' },
  { key: 'LOW', labelKey: 'low' },
  { key: 'RESOLVED', labelKey: 'resolved' },
] as const;

const PIPELINE_STAGES: Array<{
  key: keyof DashboardData['pipeline'];
  barColor: string;
}> = [
  { key: 'FLAGGED', barColor: '#F3CDC2' },
  { key: 'CONTACTED', barColor: '#F3DFAE' },
  { key: 'HOME_VISIT', barColor: '#CBDDF0' },
  { key: 'RESOLVED', barColor: '#CFE6DC' },
  { key: 'DROPPED_OUT', barColor: '#E5B4A8' },
];

export default function DashboardPage() {
  const t = useTranslations();
  const [filter, setFilter] = useState<string>('ALL');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (activeFilter: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard?filter=${encodeURIComponent(activeFilter)}`);
      if (!res.ok) throw new Error('Unable to load dashboard');
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch {
      setError('Could not load dashboard metrics. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(filter);
  }, [filter, loadDashboard]);

  async function markNotificationsRead() {
    await fetch('/api/dashboard', { method: 'PATCH' });
    loadDashboard(filter);
  }

  const maxPipeline = data
    ? Math.max(1, ...Object.values(data.pipeline))
    : 1;

  const chartData = {
    labels: data?.absenceTrend.map((d) => d.date.slice(5)) ?? [],
    datasets: [
      {
        label: 'Absent Students',
        data: data?.absenceTrend.map((d) => d.absentCount) ?? [],
        backgroundColor: '#1F6F61',
        borderRadius: 6,
      },
    ],
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('dashboard.title')}</h1>
          <p className="mt-0.5 text-sm text-muted">{t('app.tagline')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/attendance" className="btn-primary text-sm">
            {t('nav.attendance')}
          </Link>
          <Link href="/cases" className="btn-secondary text-sm">
            {t('nav.cases')}
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="card bg-[#F3CDC2] p-4 text-sm font-medium text-[#8F3A2A]">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium text-muted">{t('dashboard.totalStudents')}</p>
          <p className="mt-2 text-3xl font-medium text-ink">
            {loading && !data ? '—' : data?.summary.totalStudents ?? 0}
          </p>
          <span className="mt-2 inline-block rounded-full bg-[#CBDDF0] px-2.5 py-0.5 text-xs font-medium text-[#234E78]">
            Active roster
          </span>
        </div>

        <div className="card p-5">
          <p className="text-xs font-medium text-muted">{t('dashboard.highRisk')}</p>
          <p className="mt-2 text-3xl font-medium text-[#8F3A2A]">
            {loading && !data ? '—' : data?.summary.highRisk ?? 0}
          </p>
          <span className="mt-2 inline-block rounded-full bg-[#F3CDC2] px-2.5 py-0.5 text-xs font-medium text-[#8F3A2A]">
            Score 65+
          </span>
        </div>

        <div className="card p-5">
          <p className="text-xs font-medium text-muted">{t('dashboard.openCases')}</p>
          <p className="mt-2 text-3xl font-medium text-[#7A4F00]">
            {loading && !data ? '—' : data?.summary.openCases ?? 0}
          </p>
          <span className="mt-2 inline-block rounded-full bg-[#F3DFAE] px-2.5 py-0.5 text-xs font-medium text-[#7A4F00]">
            In follow-up
          </span>
        </div>

        <div className="card p-5">
          <p className="text-xs font-medium text-muted">{t('dashboard.reEnrolled')}</p>
          <p className="mt-2 text-3xl font-medium text-[#1F5A4C]">
            {loading && !data ? '—' : data?.summary.reEnrolled ?? 0}
          </p>
          <span className="mt-2 inline-block rounded-full bg-[#CFE6DC] px-2.5 py-0.5 text-xs font-medium text-[#1F5A4C]">
            Returned to school
          </span>
        </div>
      </div>

      {/* Reminders / Alerts */}
      {data && data.notifications.some((n) => !n.isRead) && (
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
              <Bell className="h-4 w-4 text-[#8F3A2A]" aria-hidden="true" />
              <span>Active Reminders & Escalations</span>
            </h2>
            <button
              type="button"
              onClick={markNotificationsRead}
              className="min-h-[36px] rounded-lg px-3 text-xs font-medium text-[#1F6F61] hover:bg-[#F0EDE2]"
            >
              Mark all read
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.notifications
              .filter((n) => !n.isRead)
              .slice(0, 4)
              .map((n) => (
                <div
                  key={n.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-[#E0DDD2] bg-[#FAF9F5] p-3 text-xs"
                >
                  <div>
                    <p className="font-medium text-ink">{n.title}</p>
                    <p className="mt-0.5 text-muted">{n.message}</p>
                  </div>
                  {n.studentId && (
                    <Link
                      href={`/students/${n.studentId}`}
                      className="shrink-0 font-medium text-[#1F6F61] hover:underline"
                    >
                      View
                    </Link>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Case Pipeline + Absence Trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">{t('dashboard.casePipeline')}</h2>
            <Link href="/cases" className="text-xs font-medium text-[#1F6F61] hover:underline">
              Open board →
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {PIPELINE_STAGES.map((st) => {
              const val = data?.pipeline[st.key] ?? 0;
              const pct = Math.round((val / maxPipeline) * 100);
              return (
                <div key={st.key} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-ink">{t(`stages.${st.key}`)}</span>
                    <span className="text-muted">{val}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-[#F0EDE2]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(val > 0 ? 8 : 0, pct)}%`, backgroundColor: st.barColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-medium text-ink">{t('dashboard.absenceTrend')}</h2>
          <div className="mt-4 h-56">
            {data ? (
              <Bar
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { grid: { display: false } },
                  },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {t('app.loading')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Needs Follow-up Today */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium text-ink">{t('dashboard.needsFollowUpToday')}</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter follow-up list">
            {FILTER_OPTIONS.map((opt) => {
              const active = filter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setFilter(opt.key)}
                  className={`min-h-[38px] rounded-full px-3.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary text-white'
                      : 'border border-[#D4D0C5] bg-white text-ink hover:bg-[#F6F4EC]'
                  }`}
                >
                  {t(`dashboard.${opt.labelKey}`)}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted">{t('app.loading')}</div>
        ) : !data || data.followUpList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-[#1F5A4C]" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-ink">No students match this filter</p>
            <p className="mt-0.5 text-xs text-muted">All caught up for now.</p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-[#E9E6DC]">
            {data.followUpList.map((s) => (
              <div
                key={s.id}
                className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/students/${s.id}`}
                      className="text-sm font-medium text-ink hover:text-[#1F6F61] hover:underline"
                    >
                      {s.firstName} {s.lastName}
                    </Link>
                    <span className="text-xs text-muted">
                      {s.className} · {s.admissionNo}
                    </span>
                    <StatusBadge variant={riskLevelToVariant(s.riskLevel)}>
                      {s.riskLevel} ({s.riskScore})
                    </StatusBadge>
                    {s.latestCase && (
                      <StatusBadge variant={caseStageToVariant(s.latestCase.stage)}>
                        {t(`stages.${s.latestCase.stage}`)}
                      </StatusBadge>
                    )}
                    {s.latestCase?.escalatedToPrincipal && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F3CDC2] px-2 py-0.5 text-[11px] font-medium text-[#8F3A2A]">
                        <AlertTriangle className="h-3 w-3" /> Escalated
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    Attendance: {s.attendanceRate}% · Consecutive absences: {s.consecutiveAbsences}
                    {Array.isArray(s.riskReasons) && s.riskReasons.length > 0
                      ? ` · ${s.riskReasons.map((r) => r.label).slice(0, 2).join(', ')}`
                      : ''}
                  </p>
                </div>

                <Link
                  href={`/students/${s.id}`}
                  className="btn-secondary shrink-0 text-xs"
                >
                  <span>Follow up</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
