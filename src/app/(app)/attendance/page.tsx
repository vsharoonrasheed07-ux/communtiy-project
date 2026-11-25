'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, CloudOff, RefreshCw } from 'lucide-react';
import { StatusBadge, riskLevelToVariant } from '@/components/StatusBadge';
import {
  getQueuedAttendance,
  queueOfflineAttendance,
  syncQueuedAttendance,
} from '@/lib/offline-queue';

interface ClassItem {
  id: string;
  name: string;
}

interface RosterStudent {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  riskLevel: string;
  riskScore: number;
  consecutiveAbsences: number;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
}

export default function AttendancePage() {
  const t = useTranslations();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'offline' | 'error'; text: string } | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  const refreshQueueCount = useCallback(async () => {
    const q = await getQueuedAttendance();
    setQueuedCount(q.length);
  }, []);

  useEffect(() => {
    refreshQueueCount();
    fetch('/api/classes')
      .then((r) => r.json())
      .then((data) => {
        const list: ClassItem[] = data.classes || [];
        setClasses(list);
        localStorage.setItem('sis_classes_cache', JSON.stringify(list));
        if (list.length > 0) setClassId(list[0].id);
      })
      .catch(() => {
        const cached = localStorage.getItem('sis_classes_cache');
        if (cached) {
          const list: ClassItem[] = JSON.parse(cached);
          setClasses(list);
          if (list.length > 0) setClassId(list[0].id);
        }
      });
  }, [refreshQueueCount]);

  useEffect(() => {
    if (!classId || !date) return;
    setLoading(true);
    setFeedback(null);

    fetch(`/api/attendance?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Network unavailable');
        return r.json();
      })
      .then((data) => {
        const list: RosterStudent[] = data.students || [];
        setStudents(list);
        localStorage.setItem(`sis_roster_${classId}`, JSON.stringify(list));
      })
      .catch(() => {
        const cached = localStorage.getItem(`sis_roster_${classId}`);
        if (cached) {
          setStudents(JSON.parse(cached));
        } else {
          setStudents([]);
        }
      })
      .finally(() => setLoading(false));
  }, [classId, date]);

  function setStudentStatus(id: string, status: 'PRESENT' | 'ABSENT' | 'LATE') {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  async function handleSave() {
    if (!classId || students.length === 0) return;
    setSaving(true);
    setFeedback(null);

    const payload = {
      classId,
      className: classes.find((c) => c.id === classId)?.name || 'Class',
      date,
      entries: students.map((s) => ({
        studentId: s.id,
        status: s.status,
      })),
    };

    if (!navigator.onLine) {
      await queueOfflineAttendance(payload);
      await refreshQueueCount();
      setFeedback({ kind: 'offline', text: t('attendance.queuedOffline') });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: payload.classId,
          date: payload.date,
          syncedFromOffline: false,
          entries: payload.entries,
        }),
      });
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      setFeedback({
        kind: 'success',
        text: `${t('attendance.saved')}${data.autoOpenedCases ? ` (${data.autoOpenedCases} new high-risk case opened)` : ''}`,
      });
    } catch {
      await queueOfflineAttendance(payload);
      await refreshQueueCount();
      setFeedback({ kind: 'offline', text: t('attendance.queuedOffline') });
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSync() {
    const res = await syncQueuedAttendance();
    await refreshQueueCount();
    if (res.syncedCount > 0) {
      setFeedback({ kind: 'success', text: `Synced ${res.syncedCount} queued attendance batch(es).` });
    }
  }

  const counts = students.reduce(
    (acc, s) => {
      acc[s.status] += 1;
      return acc;
    },
    { PRESENT: 0, ABSENT: 0, LATE: 0 }
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('attendance.title')}</h1>
          <p className="mt-0.5 text-sm text-muted">
            One-tap marking with automatic offline IndexedDB queue.
          </p>
        </div>

        {queuedCount > 0 && (
          <button type="button" onClick={handleManualSync} className="btn-secondary text-xs">
            <RefreshCw className="h-4 w-4" />
            <span>Sync {queuedCount} queued</span>
          </button>
        )}
      </div>

      {/* Class & Date Selector */}
      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="att-class" className="mb-1 block text-xs font-medium text-ink">
            {t('attendance.selectClass')}
          </label>
          <select
            id="att-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="input-field"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="att-date" className="mb-1 block text-xs font-medium text-ink">
            {t('attendance.selectDate')}
          </label>
          <input
            id="att-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`card flex items-center gap-2 p-4 text-sm font-medium ${
            feedback.kind === 'success'
              ? 'bg-[#CFE6DC] text-[#1F5A4C]'
              : feedback.kind === 'offline'
                ? 'bg-[#F3DFAE] text-[#7A4F00]'
                : 'bg-[#F3CDC2] text-[#8F3A2A]'
          }`}
        >
          {feedback.kind === 'offline' ? (
            <CloudOff className="h-4 w-4 shrink-0" />
          ) : (
            <Check className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Summary & Quick Save */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 border border-[#E0DDD2]">
        <div className="flex gap-3 text-xs font-medium">
          <span className="rounded-full bg-[#CFE6DC] px-3 py-1 text-[#1F5A4C]">
            {t('attendance.present')}: {counts.PRESENT}
          </span>
          <span className="rounded-full bg-[#F3CDC2] px-3 py-1 text-[#8F3A2A]">
            {t('attendance.absent')}: {counts.ABSENT}
          </span>
          <span className="rounded-full bg-[#F3DFAE] px-3 py-1 text-[#7A4F00]">
            {t('attendance.late')}: {counts.LATE}
          </span>
        </div>
        <button
          type="button"
          disabled={saving || students.length === 0}
          onClick={handleSave}
          className="btn-primary text-sm"
        >
          {saving ? t('app.loading') : t('attendance.saveAttendance')}
        </button>
      </div>

      {/* Student Tap List */}
      <div className="card divide-y divide-[#E9E6DC]">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted">{t('app.loading')}</div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">No students in this class.</div>
        ) : (
          students.map((s) => (
            <div
              key={s.id}
              className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {s.firstName} {s.lastName}
                  </span>
                  <StatusBadge variant={riskLevelToVariant(s.riskLevel)}>
                    {s.riskLevel}
                  </StatusBadge>
                </div>
                <p className="text-xs text-muted">{s.admissionNo}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => setStudentStatus(s.id, 'PRESENT')}
                  className={`min-h-[44px] min-w-[82px] rounded-xl px-3 text-xs font-medium transition-colors ${
                    s.status === 'PRESENT'
                      ? 'bg-[#CFE6DC] text-[#1F5A4C] ring-2 ring-[#1F5A4C]'
                      : 'border border-[#D4D0C5] bg-white text-ink hover:bg-[#FAF9F5]'
                  }`}
                >
                  {t('attendance.present')}
                </button>
                <button
                  type="button"
                  onClick={() => setStudentStatus(s.id, 'ABSENT')}
                  className={`min-h-[44px] min-w-[82px] rounded-xl px-3 text-xs font-medium transition-colors ${
                    s.status === 'ABSENT'
                      ? 'bg-[#F3CDC2] text-[#8F3A2A] ring-2 ring-[#8F3A2A]'
                      : 'border border-[#D4D0C5] bg-white text-ink hover:bg-[#FAF9F5]'
                  }`}
                >
                  {t('attendance.absent')}
                </button>
                <button
                  type="button"
                  onClick={() => setStudentStatus(s.id, 'LATE')}
                  className={`min-h-[44px] min-w-[82px] rounded-xl px-3 text-xs font-medium transition-colors ${
                    s.status === 'LATE'
                      ? 'bg-[#F3DFAE] text-[#7A4F00] ring-2 ring-[#7A4F00]'
                      : 'border border-[#D4D0C5] bg-white text-ink hover:bg-[#FAF9F5]'
                  }`}
                >
                  {t('attendance.late')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
