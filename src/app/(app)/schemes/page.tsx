'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StatusBadge, riskLevelToVariant } from '@/components/StatusBadge';

interface SchemeMatch {
  student: {
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    className: string;
    riskScore: number;
    riskLevel: string;
    dropoutReason: string | null;
    supportGiven: string | null;
  };
  schemes: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    eligibilityReason: string;
    benefit: string;
    priority: string;
  }>;
}

export default function SchemesPage() {
  const t = useTranslations();
  const [matches, setMatches] = useState<SchemeMatch[]>([]);
  const [category, setCategory] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/schemes')
      .then((r) => r.json())
      .then((data) => setMatches(data.matches || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = matches
    .map((m) => ({
      ...m,
      schemes:
        category === 'ALL'
          ? m.schemes
          : m.schemes.filter((sc) => sc.category === category),
    }))
    .filter((m) => m.schemes.length > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('nav.schemes')}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Automated scholarship, bicycle, mid-day meal, transport, and protection support matching.
          </p>
        </div>

        <select
          aria-label="Filter scheme category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input-field max-w-[200px]"
        >
          <option value="ALL">All categories</option>
          <option value="SCHOLARSHIP">Scholarships</option>
          <option value="BICYCLE">Free Bicycle</option>
          <option value="MEAL">Mid-Day Meal</option>
          <option value="TRANSPORT">Transport Pass</option>
          <option value="COUNSELLING">Bridge / Counselling</option>
          <option value="PROTECTION">Child Protection</option>
        </select>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-sm text-muted">{t('app.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          No scheme matches found for the selected filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((m) => (
            <div key={m.student.id} className="card p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/students/${m.student.id}`}
                    className="text-base font-medium text-ink hover:text-[#1F6F61] hover:underline"
                  >
                    {m.student.firstName} {m.student.lastName}
                  </Link>
                  <span className="text-xs text-muted">
                    {m.student.className} · {m.student.admissionNo}
                  </span>
                  <StatusBadge variant={riskLevelToVariant(m.student.riskLevel)}>
                    {m.student.riskLevel} ({m.student.riskScore})
                  </StatusBadge>
                </div>
                {m.student.supportGiven && (
                  <span className="text-xs font-medium text-[#1F5A4C]">
                    Active support: {m.student.supportGiven}
                  </span>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {m.schemes.map((sc) => (
                  <div
                    key={sc.id}
                    className="rounded-xl border border-[#E0DDD2] bg-[#FAF9F5] p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{sc.name}</span>
                      <StatusBadge variant={sc.priority === 'HIGH' ? 'high' : 'info'}>
                        {sc.category}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-muted">{sc.description}</p>
                    <p className="mt-1.5 font-medium text-[#1F5A4C]">Benefit: {sc.benefit}</p>
                    <p className="mt-0.5 text-[11px] text-muted">Why: {sc.eligibilityReason}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
