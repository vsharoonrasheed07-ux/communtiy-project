'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, GripVertical } from 'lucide-react';
import { StatusBadge, riskLevelToVariant } from '@/components/StatusBadge';

type CaseStage = 'FLAGGED' | 'CONTACTED' | 'HOME_VISIT' | 'RESOLVED' | 'DROPPED_OUT';

interface CaseItem {
  id: string;
  stage: CaseStage;
  assignedToId: string | null;
  escalatedToPrincipal: boolean;
  dropoutReason: string | null;
  supportGiven: string | null;
  lastActionAt: string;
  student: {
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    riskScore: number;
    riskLevel: string;
    consecutiveAbsences: number;
    class: { name: string };
  };
  assignedTo: { id: string; name: string } | null;
}

interface StaffUser {
  id: string;
  name: string;
  role: string;
}

const STAGES: Array<{ key: CaseStage; headerBg: string; headerText: string }> = [
  { key: 'FLAGGED', headerBg: '#F3CDC2', headerText: '#8F3A2A' },
  { key: 'CONTACTED', headerBg: '#F3DFAE', headerText: '#7A4F00' },
  { key: 'HOME_VISIT', headerBg: '#CBDDF0', headerText: '#234E78' },
  { key: 'RESOLVED', headerBg: '#CFE6DC', headerText: '#1F5A4C' },
  { key: 'DROPPED_OUT', headerBg: '#E5B4A8', headerText: '#6F2A1E' },
];

function KanbanCard({
  item,
  staff,
  onStageChange,
  onAssign,
}: {
  item: CaseItem;
  staff: StaffUser[];
  onStageChange: (caseId: string, stage: CaseStage) => void;
  onAssign: (caseId: string, userId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.65 : 1,
  };

  const daysSinceAction = Math.floor(
    (Date.now() - new Date(item.lastActionAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-2xl border border-[#E0DDD2] bg-white p-3.5 space-y-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/students/${item.student.id}`}
            className="text-sm font-medium text-ink hover:text-[#1F6F61] hover:underline"
          >
            {item.student.firstName} {item.student.lastName}
          </Link>
          <p className="text-xs text-muted">
            {item.student.class.name} · {item.student.admissionNo}
          </p>
        </div>

        <button
          type="button"
          aria-label={`Drag case for ${item.student.firstName}`}
          className="flex h-8 w-8 cursor-grab items-center justify-center rounded-lg text-muted hover:bg-[#FAF9F5]"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge variant={riskLevelToVariant(item.student.riskLevel)}>
          {item.student.riskScore}/100
        </StatusBadge>
        {item.escalatedToPrincipal && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F3CDC2] px-2 py-0.5 text-[11px] font-medium text-[#8F3A2A]">
            <AlertTriangle className="h-3 w-3" /> Escalated
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted">
        {item.student.consecutiveAbsences}d absent · Last action {daysSinceAction}d ago
      </p>

      <div className="space-y-1.5 pt-1">
        <select
          aria-label={`Stage for ${item.student.firstName}`}
          value={item.stage}
          onChange={(e) => onStageChange(item.id, e.target.value as CaseStage)}
          className="min-h-[36px] w-full rounded-lg border border-[#D4D0C5] bg-[#FAF9F5] px-2 text-xs text-ink"
        >
          {STAGES.map((st) => (
            <option key={st.key} value={st.key}>
              Move to: {st.key.replace('_', ' ')}
            </option>
          ))}
        </select>

        <select
          aria-label={`Assignee for ${item.student.firstName}`}
          value={item.assignedToId || ''}
          onChange={(e) => onAssign(item.id, e.target.value)}
          className="min-h-[36px] w-full rounded-lg border border-[#D4D0C5] bg-white px-2 text-xs text-ink"
        >
          <option value="">Unassigned</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function KanbanColumn({
  stage,
  label,
  headerBg,
  headerText,
  items,
  staff,
  onStageChange,
  onAssign,
}: {
  stage: CaseStage;
  label: string;
  headerBg: string;
  headerText: string;
  items: CaseItem[];
  staff: StaffUser[];
  onStageChange: (caseId: string, stage: CaseStage) => void;
  onAssign: (caseId: string, userId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[320px] min-w-[260px] flex-1 flex-col rounded-2xl border p-3 transition-colors ${
        isOver ? 'border-[#1F6F61] bg-[#E8EFEA]' : 'border-[#E0DDD2] bg-[#FAF9F5]'
      }`}
    >
      <div
        className="mb-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium"
        style={{ backgroundColor: headerBg, color: headerText }}
      >
        <span>{label}</span>
        <span>{items.length}</span>
      </div>
      <div className="space-y-2.5">
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            staff={staff}
            onStageChange={onStageChange}
            onAssign={onAssign}
          />
        ))}
        {items.length === 0 && (
          <p className="py-6 text-center text-xs text-muted">Drop case here</p>
        )}
      </div>
    </div>
  );
}

export default function CasesPage() {
  const t = useTranslations();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/cases');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setCases(data.cases || []);
      setStaff(data.staff || []);
    } catch {
      setError('Could not load cases board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  async function updateStage(caseId: string, newStage: CaseStage) {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, stage: newStage } : c))
    );

    const res = await fetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    });
    if (!res.ok) {
      loadCases();
    }
  }

  async function assignCase(caseId: string, userId: string) {
    const res = await fetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedToId: userId || null }),
    });
    if (res.ok) {
      loadCases();
    } else {
      const json = await res.json();
      setError(json.error || 'Only Principal or Admin can reassign cases.');
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const caseId = String(active.id);
    const targetStage = String(over.id) as CaseStage;
    const existing = cases.find((c) => c.id === caseId);
    if (existing && existing.stage !== targetStage) {
      updateStage(caseId, targetStage);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <div>
        <h1 className="text-2xl font-medium text-ink">{t('nav.cases')}</h1>
        <p className="mt-0.5 text-sm text-muted">
          Drag cards between stages to track intervention progress. Cases inactive for 7+ days escalate automatically.
        </p>
      </div>

      {error && (
        <div role="alert" className="card bg-[#F3CDC2] p-4 text-sm font-medium text-[#8F3A2A]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card p-10 text-center text-sm text-muted">{t('app.loading')}</div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((st) => (
              <KanbanColumn
                key={st.key}
                stage={st.key}
                label={t(`stages.${st.key}`)}
                headerBg={st.headerBg}
                headerText={st.headerText}
                items={cases.filter((c) => c.stage === st.key)}
                staff={staff}
                onStageChange={updateStage}
                onAssign={assignCase}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}
