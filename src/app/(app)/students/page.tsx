'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, Upload, Search, X } from 'lucide-react';
import { StatusBadge, riskLevelToVariant, caseStageToVariant } from '@/components/StatusBadge';

interface ClassItem {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  gender: string;
  wardVillage: string;
  guardianName: string;
  guardianPhone: string;
  attendanceRate: number;
  consecutiveAbsences: number;
  riskScore: number;
  riskLevel: string;
  pendingFees: boolean;
  distanceKm: number;
  flagMigration: boolean;
  flagHealth: boolean;
  flagChildLabour: boolean;
  flagEarlyMarriage: boolean;
  class: { id: string; name: string };
  cases: Array<{ id: string; stage: string }>;
}

const SAMPLE_CSV = `admissionNo,firstName,lastName,gender,className,wardVillage,guardianName,guardianPhone,distanceKm,pendingFees
SIS-201,Kavya,Rao,Female,Class 6A,Ward 4 - Hebbal,Suresh Rao,+919845011223,3.5,true
SIS-202,Rohan,Naik,Male,Class 6A,Ward 2 - Yelahanka,Meena Naik,+919845022334,1.2,false`;

export default function StudentsPage() {
  const t = useTranslations();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add/Edit modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    admissionNo: '',
    firstName: '',
    lastName: '',
    gender: 'Female',
    grade: '6',
    section: 'A',
    classId: '',
    wardVillage: '',
    guardianName: '',
    guardianPhone: '',
    distanceKm: '1.0',
    pendingFees: false,
    flagMigration: false,
    flagHealth: false,
    flagChildLabour: false,
    flagEarlyMarriage: false,
  });

  // CSV Import modal
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [csvStatus, setCsvStatus] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (classId) params.set('classId', classId);
      if (riskLevel) params.set('riskLevel', riskLevel);

      const [studRes, clsRes] = await Promise.all([
        fetch(`/api/students?${params.toString()}`),
        fetch('/api/classes'),
      ]);
      if (!studRes.ok) throw new Error('Failed to load students');
      const studJson = await studRes.json();
      setStudents(studJson.students || []);

      if (clsRes.ok) {
        const clsJson = await clsRes.json();
        const clsList = clsJson.classes || [];
        setClasses(clsList);
        if (clsList.length > 0 && !form.classId) {
          setForm((f) => ({ ...f, classId: clsList[0].id }));
        }
      }
    } catch {
      setError('Could not load student directory.');
    } finally {
      setLoading(false);
    }
  }, [search, classId, riskLevel, form.classId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openAddModal() {
    setEditingId(null);
    setFormError('');
    setForm({
      admissionNo: '',
      firstName: '',
      lastName: '',
      gender: 'Female',
      grade: '6',
      section: 'A',
      classId: classes[0]?.id || '',
      wardVillage: '',
      guardianName: '',
      guardianPhone: '',
      distanceKm: '1.0',
      pendingFees: false,
      flagMigration: false,
      flagHealth: false,
      flagChildLabour: false,
      flagEarlyMarriage: false,
    });
    setShowFormModal(true);
  }

  function openEditModal(s: StudentRow) {
    setEditingId(s.id);
    setFormError('');
    setForm({
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      gender: s.gender,
      grade: s.class.name.match(/\d+/)?.[0] || '6',
      section: s.class.name.replace(/[^a-zA-Z]/g, '').slice(-1) || 'A',
      classId: s.class.id,
      wardVillage: s.wardVillage,
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      distanceKm: String(s.distanceKm),
      pendingFees: s.pendingFees,
      flagMigration: s.flagMigration,
      flagHealth: s.flagHealth,
      flagChildLabour: s.flagChildLabour,
      flagEarlyMarriage: s.flagEarlyMarriage,
    });
    setShowFormModal(true);
  }

  async function handleSaveStudent(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const url = editingId ? `/api/students/${editingId}` : '/api/students';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          distanceKm: Number(form.distanceKm),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || 'Could not save student');
        setSaving(false);
        return;
      }
      setShowFormModal(false);
      loadData();
    } catch {
      setFormError('Network error while saving student.');
    } finally {
      setSaving(false);
    }
  }

  async function handleImportCsv(e: React.FormEvent) {
    e.preventDefault();
    setCsvStatus('Importing...');
    try {
      const res = await fetch('/api/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCsvStatus(json.error || 'Import failed');
        return;
      }
      setCsvStatus(
        `Imported ${json.imported} students.${json.errors?.length ? ` Errors: ${json.errors.join(' | ')}` : ''}`
      );
      loadData();
    } catch {
      setCsvStatus('Network error during CSV import.');
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('nav.students')}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Search, filter, add, or bulk-import students into StayInSchool.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCsvStatus('');
              setShowCsvModal(true);
            }}
            className="btn-secondary text-sm"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>CSV Import</span>
          </button>
          <button type="button" onClick={openAddModal} className="btn-primary text-sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search students"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, admission no, ward..."
            className="input-field pl-9"
          />
        </div>
        <select
          aria-label="Filter by class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="input-field"
        >
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by risk level"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value)}
          className="input-field"
        >
          <option value="">All risk levels</option>
          <option value="HIGH">High Risk</option>
          <option value="MEDIUM">Medium Risk</option>
          <option value="LOW">Low Risk</option>
        </select>
      </div>

      {error && (
        <div role="alert" className="card bg-[#F3CDC2] p-4 text-sm font-medium text-[#8F3A2A]">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted">{t('app.loading')}</div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            No students match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E0DDD2] bg-[#FAF9F5] text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Ward / Village</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3 text-right">Actions</th>
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
                        {s.firstName} {s.lastName}
                      </Link>
                      <p className="text-xs text-muted">{s.admissionNo}</p>
                    </td>
                    <td className="px-4 py-3 text-ink">{s.class.name}</td>
                    <td className="px-4 py-3 text-muted">{s.wardVillage}</td>
                    <td className="px-4 py-3 text-ink">
                      {s.attendanceRate}%
                      {s.consecutiveAbsences > 0 && (
                        <span className="ml-1.5 text-xs text-[#8F3A2A]">
                          ({s.consecutiveAbsences}d absent)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={riskLevelToVariant(s.riskLevel)}>
                        {s.riskLevel} ({s.riskScore})
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      {s.cases[0] ? (
                        <StatusBadge variant={caseStageToVariant(s.cases[0].stage)}>
                          {t(`stages.${s.cases[0].stage}`)}
                        </StatusBadge>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          className="min-h-[36px] rounded-lg border border-[#D4D0C5] px-3 text-xs font-medium text-ink hover:bg-[#F0EDE2]"
                        >
                          Edit
                        </button>
                        <Link
                          href={`/students/${s.id}`}
                          className="inline-flex min-h-[36px] items-center rounded-lg bg-[#1F6F61] px-3 text-xs font-medium text-white hover:bg-[#185A4E]"
                        >
                          Profile
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Student Modal */}
      {showFormModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <h2 id="student-modal-title" className="text-lg font-medium text-ink">
                {editingId ? 'Edit Student' : 'Add Student'}
              </h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setShowFormModal(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#F0EDE2]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 rounded-xl bg-[#F3CDC2] px-3 py-2 text-xs font-medium text-[#8F3A2A]">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveStudent} className="mt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Admission No</label>
                  <input
                    required
                    value={form.admissionNo}
                    onChange={(e) => setForm({ ...form, admissionNo: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Class (1 - 10)</label>
                  <select
                    required
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
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
                  <label className="mb-1 block text-xs font-medium text-ink">Section</label>
                  <select
                    required
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value })}
                    className="input-field"
                  >
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                    <option value="D">Section D</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">First Name</label>
                  <input
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Last Name</label>
                  <input
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="input-field"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.distanceKm}
                    onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Ward / Village</label>
                <input
                  required
                  value={form.wardVillage}
                  onChange={(e) => setForm({ ...form, wardVillage: e.target.value })}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Guardian Name</label>
                  <input
                    required
                    value={form.guardianName}
                    onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Guardian Phone</label>
                  <input
                    required
                    value={form.guardianPhone}
                    onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                {[
                  { key: 'pendingFees', label: 'Pending fees (+10)' },
                  { key: 'flagMigration', label: 'Migration flag (+10)' },
                  { key: 'flagHealth', label: 'Health flag (+10)' },
                  { key: 'flagChildLabour', label: 'Child labour flag (+10)' },
                  { key: 'flagEarlyMarriage', label: 'Early marriage flag (+10)' },
                ].map((chk) => (
                  <label key={chk.key} className="flex min-h-[36px] items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(form[chk.key as keyof typeof form])}
                      onChange={(e) =>
                        setForm({ ...form, [chk.key]: e.target.checked })
                      }
                      className="h-4 w-4 accent-[#1F6F61]"
                    />
                    <span>{chk.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="btn-secondary text-sm"
                >
                  {t('app.cancel')}
                </button>
                <button type="submit" disabled={saving} className="btn-primary text-sm">
                  {saving ? t('app.loading') : t('app.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="csv-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="card w-full max-w-xl p-6">
            <div className="flex items-center justify-between">
              <h2 id="csv-modal-title" className="text-lg font-medium text-ink">
                Import Students from CSV
              </h2>
              <button
                type="button"
                aria-label="Close CSV modal"
                onClick={() => setShowCsvModal(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#F0EDE2]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Columns: admissionNo, firstName, lastName, gender, className, wardVillage, guardianName, guardianPhone, distanceKm, pendingFees
            </p>
            <form onSubmit={handleImportCsv} className="mt-4 space-y-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setCsvText(await f.text());
                }}
                className="text-xs"
              />
              <textarea
                rows={7}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="input-field min-h-[140px] font-mono text-xs"
              />
              {csvStatus && (
                <p className="rounded-xl bg-[#CBDDF0] px-3 py-2 text-xs font-medium text-[#234E78]">
                  {csvStatus}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCsvModal(false)}
                  className="btn-secondary text-sm"
                >
                  Close
                </button>
                <button type="submit" className="btn-primary text-sm">
                  Run Import
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
