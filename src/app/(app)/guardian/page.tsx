'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';

interface ChildView {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  attendanceRate: number;
  consecutiveAbsences: number;
  class: {
    name: string;
    teacher: { name: string; phone: string | null } | null;
  };
  attendance: Array<{ id: string; date: string; status: string }>;
  guardianMessages: Array<{
    id: string;
    senderRole: string;
    channel: string;
    body: string;
    createdAt: string;
    sender: { name: string } | null;
  }>;
}

export default function GuardianPortalPage() {
  const t = useTranslations();
  const [children, setChildren] = useState<ChildView[]>([]);
  const [replyByStudent, setReplyByStudent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadChildren = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guardian');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setChildren(data.children || []);
    } catch {
      setError('Unable to load student attendance.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  async function handleSendReply(e: React.FormEvent, studentId: string) {
    e.preventDefault();
    const text = (replyByStudent[studentId] || '').trim();
    if (!text) return;

    const res = await fetch('/api/guardian', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, body: text, channel: 'PORTAL' }),
    });
    if (res.ok) {
      setReplyByStudent((prev) => ({ ...prev, [studentId]: '' }));
      loadChildren();
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-medium text-ink">{t('guardian.title')}</h1>
        <p className="mt-0.5 text-sm text-muted">{t('guardian.subtitle')}</p>
      </div>

      {error && (
        <div role="alert" className="card bg-[#F3CDC2] p-4 text-sm font-medium text-[#8F3A2A]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-sm text-muted">{t('app.loading')}</div>
      ) : children.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          No student record is linked to this guardian account yet.
        </div>
      ) : (
        children.map((child) => (
          <div key={child.id} className="space-y-4">
            <div className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-medium text-ink">
                    {child.firstName} {child.lastName}
                  </h2>
                  <p className="text-xs text-muted">
                    {child.class.name} · {child.admissionNo}
                    {child.class.teacher ? ` · Teacher: ${child.class.teacher.name}` : ''}
                  </p>
                </div>
                <StatusBadge variant={child.attendanceRate >= 75 ? 'low' : 'high'}>
                  {t('guardian.attendanceRate')}: {child.attendanceRate}%
                </StatusBadge>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-medium text-muted">
                  {t('guardian.recentAttendance')}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {child.attendance.slice(0, 20).map((a) => {
                    const cls =
                      a.status === 'PRESENT'
                        ? 'bg-[#CFE6DC] text-[#1F5A4C]'
                        : a.status === 'ABSENT'
                          ? 'bg-[#F3CDC2] text-[#8F3A2A]'
                          : 'bg-[#F3DFAE] text-[#7A4F00]';
                    return (
                      <span key={a.id} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${cls}`}>
                        {a.date.slice(5, 10)} · {a.status}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="card p-5 space-y-3">
              <h3 className="text-sm font-medium text-ink">{t('guardian.messages')}</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {child.guardianMessages.length === 0 ? (
                  <p className="text-xs text-muted">No messages yet.</p>
                ) : (
                  child.guardianMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl p-3 text-xs ${
                        m.senderRole === 'GUARDIAN'
                          ? 'bg-[#CFE6DC]/60 text-[#1F5A4C]'
                          : 'bg-[#FAF9F5] text-ink'
                      }`}
                    >
                      <div className="flex justify-between text-[11px] text-muted">
                        <span>{m.sender?.name || m.senderRole}</span>
                        <span>{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-1">{m.body}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={(e) => handleSendReply(e, child.id)} className="flex gap-2">
                <input
                  value={replyByStudent[child.id] || ''}
                  onChange={(e) =>
                    setReplyByStudent((prev) => ({ ...prev, [child.id]: e.target.value }))
                  }
                  placeholder={t('guardian.replyPlaceholder')}
                  className="input-field flex-1"
                />
                <button type="submit" className="btn-primary text-xs">
                  <Send className="h-4 w-4" />
                  <span>{t('guardian.sendReply')}</span>
                </button>
              </form>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
