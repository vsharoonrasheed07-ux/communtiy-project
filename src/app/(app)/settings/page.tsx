'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/StatusBadge';

interface RiskRules {
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
  smsAlertConsecutiveDays: number;
  escalationDays: number;
  defaultLanguage: 'en' | 'hi' | 'kn';
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  isActive: boolean;
}

interface ClassItem {
  id: string;
  name: string;
  grade: number;
  section: string;
  teacher: { id: string; name: string } | null;
  _count: { students: number };
}

export default function SettingsPage() {
  const t = useTranslations();
  const [rules, setRules] = useState<RiskRules | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'TEACHER',
    phone: '',
  });
  const [newClass, setNewClass] = useState({
    name: '',
    grade: '6',
    section: 'A',
    teacherId: '',
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Access denied');
      const data = await res.json();
      setRules(data.riskRules);
      setUsers(data.users || []);
      setClasses(data.classes || []);
    } catch {
      setErrorMsg('Admin access required to manage settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function saveRiskRules(e: React.FormEvent) {
    e.preventDefault();
    if (!rules) return;
    setStatusMsg('');
    setErrorMsg('');
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rules),
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorMsg(json.error || 'Could not update risk rules');
      return;
    }
    setStatusMsg(`Risk rules saved and ${json.recalculated} student scores recalculated.`);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorMsg(json.error || 'Could not create user');
      return;
    }
    setNewUser({ name: '', email: '', password: '', role: 'TEACHER', phone: '' });
    setStatusMsg(`Created user ${json.user.email}.`);
    loadSettings();
  }

  async function toggleUserActive(u: UserItem) {
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    loadSettings();
  }

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newClass.name,
        grade: Number(newClass.grade),
        section: newClass.section,
        teacherId: newClass.teacherId || null,
      }),
    });
    if (!res.ok) {
      const j = await res.json();
      setErrorMsg(j.error || 'Could not create class');
      return;
    }
    setNewClass({ name: '', grade: '6', section: 'A', teacherId: '' });
    loadSettings();
  }

  if (loading) return <div className="p-8 text-sm text-muted">{t('app.loading')}</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">{t('nav.settings')}</h1>
        <p className="mt-0.5 text-sm text-muted">
          Configure risk-score rules, escalation days, users, and school classes.
        </p>
      </div>

      {statusMsg && (
        <div className="card bg-[#CFE6DC] p-4 text-sm font-medium text-[#1F5A4C]">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="card bg-[#F3CDC2] p-4 text-sm font-medium text-[#8F3A2A]">
          {errorMsg}
        </div>
      )}

      {/* Risk Rules */}
      {rules && (
        <form onSubmit={saveRiskRules} className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-medium text-ink">Risk Score Rules (0-100)</h2>
            <button type="submit" className="btn-primary text-xs">
              Save & Recalculate All
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[
              { key: 'attendanceThresholdPct', label: 'Attendance min (%)' },
              { key: 'attendancePoints', label: 'Low attendance points' },
              { key: 'consecutiveAbsenceDays', label: 'Consecutive absent days' },
              { key: 'consecutiveAbsencePoints', label: 'Consecutive absence pts' },
              { key: 'failingMarksThresholdPct', label: 'Failing marks below (%)' },
              { key: 'failingMarksPoints', label: 'Failing marks pts' },
              { key: 'pendingFeesPoints', label: 'Pending fees pts' },
              { key: 'longDistanceKm', label: 'Long distance (km)' },
              { key: 'longDistancePoints', label: 'Long distance pts' },
              { key: 'migrationPoints', label: 'Migration flag pts' },
              { key: 'healthPoints', label: 'Health flag pts' },
              { key: 'childLabourPoints', label: 'Child labour pts' },
              { key: 'earlyMarriagePoints', label: 'Early marriage pts' },
              { key: 'mediumRiskThreshold', label: 'Medium threshold' },
              { key: 'highRiskThreshold', label: 'High threshold' },
              { key: 'smsAlertConsecutiveDays', label: 'Auto-SMS after days' },
              { key: 'escalationDays', label: 'Escalate stale case (days)' },
            ].map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs font-medium text-muted">{field.label}</label>
                <input
                  type="number"
                  step={field.key === 'longDistanceKm' ? '0.5' : '1'}
                  value={rules[field.key as keyof RiskRules]}
                  onChange={(e) =>
                    setRules({ ...rules, [field.key]: Number(e.target.value) })
                  }
                  className="input-field"
                />
              </div>
            ))}

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Default Language</label>
              <select
                value={rules.defaultLanguage}
                onChange={(e) =>
                  setRules({ ...rules, defaultLanguage: e.target.value as 'en' | 'hi' | 'kn' })
                }
                className="input-field"
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="kn">Kannada</option>
              </select>
            </div>
          </div>
        </form>
      )}

      {/* Classes & Users */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5 space-y-4">
          <h2 className="text-base font-medium text-ink">Classes</h2>
          <div className="space-y-2">
            {classes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-[#E0DDD2] bg-[#FAF9F5] px-3 py-2.5 text-xs"
              >
                <div>
                  <p className="font-medium text-ink">{c.name}</p>
                  <p className="text-muted">
                    Teacher: {c.teacher?.name || 'Unassigned'} · {c._count.students} students
                  </p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={createClass} className="space-y-2 border-t border-[#E0DDD2] pt-3">
            <p className="text-xs font-medium text-ink">Add Class</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted">Class (1 - 10)</label>
                <select
                  required
                  value={newClass.grade}
                  onChange={(e) => {
                    const g = e.target.value;
                    setNewClass({
                      ...newClass,
                      grade: g,
                      name: `Class ${g}${newClass.section}`,
                    });
                  }}
                  className="input-field"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <option key={num} value={num}>
                      Class {num}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted">Section (A - D)</label>
                <select
                  required
                  value={newClass.section}
                  onChange={(e) => {
                    const sec = e.target.value;
                    setNewClass({
                      ...newClass,
                      section: sec,
                      name: `Class ${newClass.grade}${sec}`,
                    });
                  }}
                  className="input-field"
                >
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                  <option value="D">Section D</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <select
                value={newClass.teacherId}
                onChange={(e) => setNewClass({ ...newClass, teacherId: e.target.value })}
                className="input-field flex-1"
              >
                <option value="">Assign teacher (optional)</option>
                {users
                  .filter((u) => u.role === 'TEACHER')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
              <button type="submit" className="btn-primary text-xs shrink-0">
                Add Class
              </button>
            </div>
          </form>
        </div>

        <div className="card p-5 space-y-4">
          <h2 className="text-base font-medium text-ink">Users</h2>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-xl border border-[#E0DDD2] bg-[#FAF9F5] px-3 py-2.5 text-xs"
              >
                <div>
                  <p className="font-medium text-ink">
                    {u.name} <span className="text-muted">({u.role})</span>
                  </p>
                  <p className="text-muted">{u.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleUserActive(u)}
                  className="min-h-[34px] rounded-lg px-2.5"
                >
                  <StatusBadge variant={u.isActive ? 'low' : 'high'}>
                    {u.isActive ? 'Active' : 'Disabled'}
                  </StatusBadge>
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={createUser} className="space-y-2 border-t border-[#E0DDD2] pt-3">
            <p className="text-xs font-medium text-ink">Create User</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                placeholder="Full name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                className="input-field"
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                required
                type="password"
                minLength={6}
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="input-field"
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="input-field"
              >
                <option value="TEACHER">Teacher</option>
                <option value="PRINCIPAL">Principal</option>
                <option value="ADMIN">Admin</option>
                <option value="GUARDIAN">Guardian</option>
              </select>
              <button type="submit" className="btn-primary text-xs">
                Add User
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
