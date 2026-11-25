'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Award } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';

interface ReEnrolledStudent {
  id: string;
  admissionNo: string;
  name: string;
  className: string;
  wardVillage: string;
  dropoutReason: string | null;
  supportGiven: string | null;
  reEnrolledAt: string | null;
  attendanceRate: number;
}

export default function ReEnrolmentPage() {
  const t = useTranslations();
  const [students, setStudents] = useState<ReEnrolledStudent[]>([]);
  const [droppedOutCount, setDroppedOutCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((data) => {
        setStudents(data.reEnrolledStudents || []);
        setDroppedOutCount(data.summary?.droppedOut || 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalEverLeft = students.length + droppedOutCount;
  const recoveryRate =
    totalEverLeft > 0 ? Math.round((students.length / totalEverLeft) * 100) : 100;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">{t('nav.reEnrolment')}</h1>
        <p className="mt-0.5 text-sm text-muted">
          Tracking students who left school and successfully returned after targeted follow-up.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium text-muted">Students Re-enrolled</p>
          <p className="mt-2 text-3xl font-medium text-[#1F5A4C]">{students.length}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-muted">Recovery Success Rate</p>
          <p className="mt-2 text-3xl font-medium text-ink">{recoveryRate}%</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-muted">Currently Dropped Out</p>
          <p className="mt-2 text-3xl font-medium text-[#8F3A2A]">{droppedOutCount}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted">{t('app.loading')}</div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <Award className="h-8 w-8 text-[#1F5A4C]" />
            <p className="mt-2 text-sm font-medium text-ink">No re-enrolled students recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E0DDD2] bg-[#FAF9F5] text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class & Ward</th>
                  <th className="px-4 py-3">Prior Reason</th>
                  <th className="px-4 py-3">Support Provided</th>
                  <th className="px-4 py-3">Current Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E6DC]">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-[#FAF9F5]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/students/${s.id}`}
                        className="font-medium text-ink hover:text-[#1F6F61] hover:underline"
                      >
                        {s.name}
                      </Link>
                      <p className="text-xs text-muted">{s.admissionNo}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {s.className} · {s.wardVillage}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant="medium">{s.dropoutReason || 'OTHER'}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink">
                      {s.supportGiven || 'Family counselling & bridge support'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant="resolved">{s.attendanceRate}%</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
