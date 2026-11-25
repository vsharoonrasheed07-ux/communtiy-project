'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, FileText } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend
);

interface ReportsData {
  summary: {
    totalStudents: number;
    highRisk: number;
    droppedOut: number;
    reEnrolled: number;
    resolvedCases: number;
  };
  dropoutReasons: Array<{ reason: string; count: number }>;
  classAttendance: Array<{
    classId: string;
    className: string;
    teacherName: string;
    studentCount: number;
    avgAttendance: number;
    highRiskCount: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    attendanceRate: number;
    absentCount: number;
    totalRecords: number;
  }>;
  wardHeatmap: Array<{
    ward: string;
    totalStudents: number;
    highRisk: number;
    mediumRisk: number;
    droppedOut: number;
    reEnrolled: number;
    avgAttendance: number;
  }>;
}

export default function ReportsPage() {
  const t = useTranslations();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => {
        if (!r.ok) throw new Error('Failed');
        return r.json();
      })
      .then(setData)
      .catch(() => setError('Unable to load reports data.'))
      .finally(() => setLoading(false));
  }, []);

  function exportPdf() {
    if (!data) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('StayInSchool — District & School Retention Report', 14, 18);
    doc.setFontSize(10);
    doc.text(
      `Generated: ${new Date().toLocaleDateString()} | Total: ${data.summary.totalStudents} | High Risk: ${data.summary.highRisk} | Re-enrolled: ${data.summary.reEnrolled}`,
      14,
      26
    );

    autoTable(doc, {
      startY: 32,
      head: [['Class', 'Teacher', 'Students', 'Avg Attendance %', 'High Risk']],
      body: data.classAttendance.map((c) => [
        c.className,
        c.teacherName,
        c.studentCount,
        `${c.avgAttendance}%`,
        c.highRiskCount,
      ]),
      headStyles: { fillColor: [23, 66, 59] },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 80;
    autoTable(doc, {
      startY: finalY + 10,
      head: [['Ward / Village', 'Students', 'High Risk', 'Medium Risk', 'Dropped Out', 'Re-enrolled', 'Avg Att %']],
      body: data.wardHeatmap.map((w) => [
        w.ward,
        w.totalStudents,
        w.highRisk,
        w.mediumRisk,
        w.droppedOut,
        w.reEnrolled,
        `${w.avgAttendance}%`,
      ]),
      headStyles: { fillColor: [31, 111, 97] },
    });

    doc.save('stayinschool-report.pdf');
  }

  if (loading) {
    return <div className="p-8 text-sm text-muted">{t('app.loading')}</div>;
  }

  if (error || !data) {
    return (
      <div className="card bg-[#F3CDC2] p-5 text-sm font-medium text-[#8F3A2A]">
        {error || 'No report data available'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('nav.reports')}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Dropout reasons, class attendance, monthly trends, and ward-level officer overview.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/reports?format=csv" className="btn-secondary text-sm">
            <Download className="h-4 w-4" />
            <span>{t('app.exportCsv')}</span>
          </a>
          <button type="button" onClick={exportPdf} className="btn-primary text-sm">
            <FileText className="h-4 w-4" />
            <span>{t('app.exportPdf')}</span>
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink">Dropout & Risk Reasons</h2>
          <div className="mt-4 h-60">
            {data.dropoutReasons.length === 0 ? (
              <p className="pt-20 text-center text-xs text-muted">No dropout reasons recorded.</p>
            ) : (
              <Doughnut
                data={{
                  labels: data.dropoutReasons.map((r) => r.reason),
                  datasets: [
                    {
                      data: data.dropoutReasons.map((r) => r.count),
                      backgroundColor: [
                        '#1F6F61',
                        '#F3CDC2',
                        '#F3DFAE',
                        '#CBDDF0',
                        '#CFE6DC',
                        '#D7C7AE',
                        '#B7D1CC',
                        '#E5B4A8',
                      ],
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom' } },
                }}
              />
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink">Class-wise Attendance (%)</h2>
          <div className="mt-4 h-60">
            <Bar
              data={{
                labels: data.classAttendance.map((c) => c.className),
                datasets: [
                  {
                    label: 'Avg Attendance %',
                    data: data.classAttendance.map((c) => c.avgAttendance),
                    backgroundColor: '#1F6F61',
                    borderRadius: 6,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { min: 0, max: 100 } },
              }}
            />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink">Monthly Attendance Trend (%)</h2>
          <div className="mt-4 h-60">
            <Line
              data={{
                labels: data.monthlyTrends.map((m) => m.month),
                datasets: [
                  {
                    label: 'Attendance %',
                    data: data.monthlyTrends.map((m) => m.attendanceRate),
                    borderColor: '#17423B',
                    backgroundColor: '#CFE6DC',
                    tension: 0.25,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { min: 0, max: 100 } },
              }}
            />
          </div>
        </div>
      </div>

      {/* Ward / Village Heatmap Table for District Officers */}
      <div className="card overflow-hidden">
        <div className="border-b border-[#E0DDD2] px-5 py-4">
          <h2 className="text-base font-medium text-ink">
            Ward / Village Risk Heatmap (District Officer View)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E0DDD2] bg-[#FAF9F5] text-xs font-medium text-muted">
              <tr>
                <th className="px-4 py-3">Ward / Village</th>
                <th className="px-4 py-3">Total Students</th>
                <th className="px-4 py-3">High Risk</th>
                <th className="px-4 py-3">Medium Risk</th>
                <th className="px-4 py-3">Dropped Out</th>
                <th className="px-4 py-3">Re-enrolled</th>
                <th className="px-4 py-3">Avg Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E6DC]">
              {data.wardHeatmap.map((w) => {
                const highCellBg =
                  w.highRisk >= 3
                    ? 'bg-[#F3CDC2] text-[#8F3A2A]'
                    : w.highRisk >= 1
                      ? 'bg-[#F3DFAE] text-[#7A4F00]'
                      : 'bg-[#CFE6DC] text-[#1F5A4C]';

                return (
                  <tr key={w.ward}>
                    <td className="px-4 py-3 font-medium text-ink">{w.ward}</td>
                    <td className="px-4 py-3">{w.totalStudents}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-medium ${highCellBg}`}>
                        {w.highRisk}
                      </span>
                    </td>
                    <td className="px-4 py-3">{w.mediumRisk}</td>
                    <td className="px-4 py-3">{w.droppedOut}</td>
                    <td className="px-4 py-3 text-[#1F5A4C] font-medium">{w.reEnrolled}</td>
                    <td className="px-4 py-3">{w.avgAttendance}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
