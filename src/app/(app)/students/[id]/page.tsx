'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Paperclip, PhoneCall, Plus, Send, X } from 'lucide-react';
import { StatusBadge, riskLevelToVariant, caseStageToVariant } from '@/components/StatusBadge';

interface StudentDetail {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  gender: string;
  wardVillage: string;
  address: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianRelation: string;
  riskScore: number;
  riskLevel: string;
  riskReasons: Array<{ key: string; label: string; points: number }>;
  attendanceRate: number;
  consecutiveAbsences: number;
  averageMarks: number;
  pendingFees: boolean;
  distanceKm: number;
  flagMigration: boolean;
  flagHealth: boolean;
  flagChildLabour: boolean;
  flagEarlyMarriage: boolean;
  isDroppedOut: boolean;
  reEnrolled: boolean;
  dropoutReason: string | null;
  supportGiven: string | null;
  class: { id: string; name: string; teacher: { id: string; name: string } | null };
  attendance: Array<{ id: string; date: string; status: string; syncedFromOffline: boolean }>;
  marks: Array<{ id: string; subject: string; examName: string; score: number; maxScore: number }>;
  cases: Array<{ id: string; stage: string; escalatedToPrincipal: boolean; openedAt: string }>;
  followUps: Array<{
    id: string;
    type: string;
    outcome: string;
    notes: string;
    nextFollowUpDate: string | null;
    createdAt: string;
    author: { name: string } | null;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    caption: string | null;
    createdAt: string;
  }>;
  guardianMessages: Array<{
    id: string;
    senderRole: string;
    channel: string;
    body: string;
    createdAt: string;
    sender: { name: string } | null;
  }>;
}

interface MatchedScheme {
  id: string;
  name: string;
  category: string;
  benefit: string;
  eligibilityReason: string;
}

export default function StudentProfilePage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations();

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [schemes, setSchemes] = useState<MatchedScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Log Follow-up Modal
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fuForm, setFuForm] = useState({
    type: 'CALL',
    outcome: '',
    notes: '',
    nextFollowUpDate: '',
    advanceStage: '',
    dropoutReason: '',
    supportGiven: '',
  });
  const [fuFile, setFuFile] = useState<File | null>(null);
  const [fuSubmitting, setFuSubmitting] = useState(false);

  // Mark form
  const [markForm, setMarkForm] = useState({ subject: '', examName: '', score: '', maxScore: '100' });

  // Guardian message
  const [msgText, setMsgText] = useState('');
  const [msgChannel, setMsgChannel] = useState<'PORTAL' | 'SMS' | 'WHATSAPP'>('PORTAL');

  // Attachment standalone
  const [uploadCaption, setUploadCaption] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/students/${params.id}`);
      if (!res.ok) throw new Error('Unable to load student profile');
      const json = await res.json();
      setStudent(json.student);
      setSchemes(json.matchedSchemes || []);
    } catch {
      setError('Could not load student profile or access denied.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function ensureActiveCase(): Promise<string | null> {
    if (!student) return null;
    const open = student.cases.find((c) => !['RESOLVED', 'DROPPED_OUT'].includes(c.stage));
    if (open) return open.id;
    if (student.cases[0]) return student.cases[0].id;

    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id, notes: 'Opened for follow-up' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.case.id;
  }

  async function handleSubmitFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!student) return;
    setFuSubmitting(true);
    try {
      const caseId = await ensureActiveCase();
      if (!caseId) throw new Error('Could not find or open case');

      const res = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          studentId: student.id,
          type: fuForm.type,
          outcome: fuForm.outcome,
          notes: fuForm.notes,
          nextFollowUpDate: fuForm.nextFollowUpDate || null,
          advanceStage: fuForm.advanceStage || undefined,
          dropoutReason: fuForm.dropoutReason || undefined,
          supportGiven: fuForm.supportGiven || undefined,
        }),
      });

      if (res.ok) {
        const fuJson = await res.json();
        if (fuFile) {
          const fd = new FormData();
          fd.append('file', fuFile);
          fd.append('studentId', student.id);
          fd.append('followUpId', fuJson.followUp.id);
          fd.append('caption', `${fuForm.type} attachment`);
          await fetch('/api/attachments', { method: 'POST', body: fd });
        }
        setShowFollowUp(false);
        setFuForm({
          type: 'CALL',
          outcome: '',
          notes: '',
          nextFollowUpDate: '',
          advanceStage: '',
          dropoutReason: '',
          supportGiven: '',
        });
        setFuFile(null);
        loadProfile();
      }
    } finally {
      setFuSubmitting(false);
    }
  }

  async function handleAddMark(e: React.FormEvent) {
    e.preventDefault();
    if (!student) return;
    const res = await fetch(`/api/students/${student.id}/marks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(markForm),
    });
    if (res.ok) {
      setMarkForm({ subject: '', examName: '', score: '', maxScore: '100' });
      loadProfile();
    }
  }

  async function handleUploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !student) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('studentId', student.id);
    if (uploadCaption) fd.append('caption', uploadCaption);
    const res = await fetch('/api/attachments', { method: 'POST', body: fd });
    if (res.ok) {
      setUploadCaption('');
      loadProfile();
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!student || !msgText.trim()) return;
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: student.id,
        body: msgText,
        channel: msgChannel,
      }),
    });
    if (res.ok) {
      setMsgText('');
      loadProfile();
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-muted">{t('app.loading')}</div>;
  }

  if (error || !student) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/students" className="inline-flex items-center gap-2 text-sm text-[#1F6F61]">
          <ArrowLeft className="h-4 w-4" /> Back to students
        </Link>
        <div className="card bg-[#F3CDC2] p-5 text-sm font-medium text-[#8F3A2A]">
          {error || 'Student not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/students" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> All Students
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-medium text-ink">
              {student.firstName} {student.lastName}
            </h1>
            <StatusBadge variant={riskLevelToVariant(student.riskLevel)}>
              {student.riskLevel} Risk · {student.riskScore}/100
            </StatusBadge>
            {student.cases[0] && (
              <StatusBadge variant={caseStageToVariant(student.cases[0].stage)}>
                {t(`stages.${student.cases[0].stage}`)}
              </StatusBadge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {student.admissionNo} · {student.class.name} · {student.wardVillage}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowFollowUp(true)}
          className="btn-primary text-sm"
        >
          <PhoneCall className="h-4 w-4" aria-hidden="true" />
          <span>Log follow-up</span>
        </button>
      </div>

      {/* Top Info Grid */}
      <div className="grid gap-5 md:grid-cols-3">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink">Guardian & Details</h2>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted">Guardian</dt>
              <dd className="font-medium text-ink">
                {student.guardianName} ({student.guardianRelation})
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Phone</dt>
              <dd className="font-medium text-ink">{student.guardianPhone}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Distance</dt>
              <dd className="font-medium text-ink">{student.distanceKm} km</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Pending Fees</dt>
              <dd className="font-medium text-ink">{student.pendingFees ? 'Yes' : 'No'}</dd>
            </div>
            {student.dropoutReason && (
              <div className="flex justify-between">
                <dt className="text-muted">Dropout Reason</dt>
                <dd className="font-medium text-[#8F3A2A]">{student.dropoutReason}</dd>
              </div>
            )}
            {student.supportGiven && (
              <div>
                <dt className="text-muted">Support Given</dt>
                <dd className="mt-0.5 font-medium text-[#1F5A4C]">{student.supportGiven}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink">Risk Factors ({student.riskScore}/100)</h2>
          <div className="mt-3 space-y-2">
            {student.riskReasons.length === 0 ? (
              <p className="text-xs text-muted">No active risk flags triggered.</p>
            ) : (
              student.riskReasons.map((r) => (
                <div
                  key={r.key}
                  className="flex items-center justify-between rounded-xl bg-[#FAF9F5] px-3 py-2 text-xs"
                >
                  <span className="text-ink">{r.label}</span>
                  <span className="font-medium text-[#8F3A2A]">+{r.points}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink">Recommended Schemes</h2>
          <div className="mt-3 space-y-2">
            {schemes.length === 0 ? (
              <p className="text-xs text-muted">No welfare schemes triggered yet.</p>
            ) : (
              schemes.map((sc) => (
                <div key={sc.id} className="rounded-xl bg-[#CFE6DC]/50 p-2.5 text-xs">
                  <p className="font-medium text-[#1F5A4C]">{sc.name}</p>
                  <p className="mt-0.5 text-muted">{sc.benefit}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Attendance History + Marks */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">
              Attendance History ({student.attendanceRate}%)
            </h2>
            <span className="text-xs text-muted">
              Consecutive absences: {student.consecutiveAbsences}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {student.attendance.slice(0, 35).map((a) => {
              const color =
                a.status === 'PRESENT'
                  ? 'bg-[#CFE6DC] text-[#1F5A4C]'
                  : a.status === 'ABSENT'
                    ? 'bg-[#F3CDC2] text-[#8F3A2A]'
                    : 'bg-[#F3DFAE] text-[#7A4F00]';
              return (
                <span
                  key={a.id}
                  title={`${a.date.slice(0, 10)}: ${a.status}`}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${color}`}
                >
                  {a.date.slice(5, 10)} {a.status[0]}
                </span>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink">
            Academic Marks (Avg {student.averageMarks}%)
          </h2>
          <div className="mt-3 space-y-2">
            {student.marks.slice(0, 5).map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl bg-[#FAF9F5] px-3 py-2 text-xs"
              >
                <span>
                  {m.subject} · <span className="text-muted">{m.examName}</span>
                </span>
                <span className="font-medium text-ink">
                  {m.score}/{m.maxScore}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddMark} className="mt-3 flex flex-wrap gap-2">
            <input
              required
              placeholder="Subject"
              value={markForm.subject}
              onChange={(e) => setMarkForm({ ...markForm, subject: e.target.value })}
              className="input-field max-w-[130px]"
            />
            <input
              required
              placeholder="Exam"
              value={markForm.examName}
              onChange={(e) => setMarkForm({ ...markForm, examName: e.target.value })}
              className="input-field max-w-[120px]"
            />
            <input
              required
              type="number"
              placeholder="Score"
              value={markForm.score}
              onChange={(e) => setMarkForm({ ...markForm, score: e.target.value })}
              className="input-field max-w-[85px]"
            />
            <button type="submit" className="btn-secondary text-xs">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>
        </div>
      </div>

      {/* Follow-up Timeline + Attachments */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-medium text-ink">Follow-up Timeline</h2>
          {student.followUps.length === 0 ? (
            <p className="mt-4 text-xs text-muted">No follow-ups logged yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {student.followUps.map((f) => (
                <div key={f.id} className="rounded-xl border border-[#E0DDD2] bg-[#FAF9F5] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <StatusBadge variant="info">{f.type}</StatusBadge>
                      <span className="font-medium text-ink">{f.outcome}</span>
                    </div>
                    <span className="text-muted">
                      {f.author?.name || 'Staff'} · {new Date(f.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-ink">{f.notes}</p>
                  {f.nextFollowUpDate && (
                    <p className="mt-1.5 text-[11px] font-medium text-[#7A4F00]">
                      Next follow-up: {f.nextFollowUpDate.slice(0, 10)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink">Attachments & Home-Visit Photos</h2>
          <div className="mt-3 space-y-2">
            {student.attachments.length === 0 ? (
              <p className="text-xs text-muted">No files uploaded yet.</p>
            ) : (
              student.attachments.map((att) => (
                <a
                  key={att.id}
                  href={`/api/attachments/${att.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-[#E0DDD2] p-2.5 text-xs hover:bg-[#FAF9F5]"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#1F6F61]" />
                    <span className="truncate font-medium text-ink">{att.fileName}</span>
                  </span>
                  <span className="text-[11px] text-muted">
                    {Math.round(att.fileSize / 1024)} KB
                  </span>
                </a>
              ))
            )}
          </div>
          <div className="mt-4 space-y-2 border-t border-[#E9E6DC] pt-3">
            <input
              type="text"
              placeholder="Caption (optional)"
              value={uploadCaption}
              onChange={(e) => setUploadCaption(e.target.value)}
              className="input-field text-xs"
            />
            <label className="btn-secondary w-full cursor-pointer text-xs">
              <Paperclip className="h-3.5 w-3.5" />
              <span>Upload Photo / PDF (max 2MB)</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleUploadAttachment}
                className="sr-only"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Guardian Messages */}
      <div className="card p-5">
        <h2 className="text-sm font-medium text-ink">Guardian Communication Log</h2>
        <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
          {student.guardianMessages.length === 0 ? (
            <p className="text-xs text-muted">No portal or SMS messages yet.</p>
          ) : (
            student.guardianMessages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl p-3 text-xs ${
                  m.senderRole === 'GUARDIAN'
                    ? 'bg-[#CBDDF0]/45 text-[#234E78]'
                    : 'bg-[#FAF9F5] text-ink'
                }`}
              >
                <div className="flex justify-between text-[11px] text-muted">
                  <span>
                    {m.sender?.name || m.senderRole} ({m.channel})
                  </span>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1">{m.body}</p>
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleSendMessage} className="mt-3 flex flex-wrap gap-2">
          <select
            value={msgChannel}
            onChange={(e) => setMsgChannel(e.target.value as 'PORTAL' | 'SMS' | 'WHATSAPP')}
            className="input-field max-w-[130px]"
          >
            <option value="PORTAL">Portal</option>
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
          <input
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            placeholder="Message to guardian..."
            className="input-field flex-1"
          />
          <button type="submit" className="btn-primary text-xs">
            <Send className="h-3.5 w-3.5" /> Send
          </button>
        </form>
      </div>

      {/* Log Follow-up Modal */}
      {showFollowUp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fu-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <h2 id="fu-modal-title" className="text-lg font-medium text-ink">
                Log Follow-up — {student.firstName}
              </h2>
              <button
                type="button"
                aria-label="Close follow-up modal"
                onClick={() => setShowFollowUp(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#F0EDE2]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitFollowUp} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Contact Type</label>
                  <select
                    value={fuForm.type}
                    onChange={(e) => setFuForm({ ...fuForm, type: e.target.value })}
                    className="input-field"
                  >
                    <option value="CALL">Phone Call</option>
                    <option value="SMS">SMS</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="HOME_VISIT">Home Visit</option>
                    <option value="COUNSELLING">Counselling</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Next Follow-up</label>
                  <input
                    type="date"
                    value={fuForm.nextFollowUpDate}
                    onChange={(e) => setFuForm({ ...fuForm, nextFollowUpDate: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Outcome</label>
                <input
                  required
                  placeholder="e.g., Spoke with mother; child returning Monday"
                  value={fuForm.outcome}
                  onChange={(e) => setFuForm({ ...fuForm, outcome: e.target.value })}
                  className="input-field"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Detailed Notes</label>
                <textarea
                  required
                  rows={3}
                  value={fuForm.notes}
                  onChange={(e) => setFuForm({ ...fuForm, notes: e.target.value })}
                  className="input-field min-h-[84px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Move Case Stage</label>
                  <select
                    value={fuForm.advanceStage}
                    onChange={(e) => setFuForm({ ...fuForm, advanceStage: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Auto advance</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="HOME_VISIT">Home visit</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="DROPPED_OUT">Dropped out</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Dropout Reason</label>
                  <select
                    value={fuForm.dropoutReason}
                    onChange={(e) => setFuForm({ ...fuForm, dropoutReason: e.target.value })}
                    className="input-field"
                  >
                    <option value="">None / Not applicable</option>
                    <option value="FEES">Fees</option>
                    <option value="MIGRATION">Migration</option>
                    <option value="WORK">Work</option>
                    <option value="MARRIAGE">Marriage</option>
                    <option value="HEALTH">Health</option>
                    <option value="DISTANCE">Distance</option>
                    <option value="NO_INTEREST">No interest</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Support Given</label>
                <input
                  placeholder="e.g., Scholarship form submitted, uniform provided"
                  value={fuForm.supportGiven}
                  onChange={(e) => setFuForm({ ...fuForm, supportGiven: e.target.value })}
                  className="input-field"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink">
                  Attachment (Optional photo/doc)
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setFuFile(e.target.files?.[0] || null)}
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFollowUp(false)}
                  className="btn-secondary text-sm"
                >
                  {t('app.cancel')}
                </button>
                <button type="submit" disabled={fuSubmitting} className="btn-primary text-sm">
                  {fuSubmitting ? t('app.loading') : t('app.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
