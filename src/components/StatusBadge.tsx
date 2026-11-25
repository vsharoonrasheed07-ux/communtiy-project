import React from 'react';

type BadgeVariant = 'high' | 'medium' | 'low' | 'resolved' | 'info' | 'neutral';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  high: 'bg-[#F3CDC2] text-[#8F3A2A]',
  medium: 'bg-[#F3DFAE] text-[#7A4F00]',
  low: 'bg-[#CFE6DC] text-[#1F5A4C]',
  resolved: 'bg-[#CFE6DC] text-[#1F5A4C]',
  info: 'bg-[#CBDDF0] text-[#234E78]',
  neutral: 'bg-[#E9E6DC] text-[#3A4743]',
};

export function riskLevelToVariant(level: string): BadgeVariant {
  if (level === 'HIGH') return 'high';
  if (level === 'MEDIUM') return 'medium';
  if (level === 'LOW') return 'low';
  return 'neutral';
}

export function caseStageToVariant(stage: string): BadgeVariant {
  if (stage === 'FLAGGED' || stage === 'DROPPED_OUT') return 'high';
  if (stage === 'CONTACTED') return 'medium';
  if (stage === 'HOME_VISIT') return 'info';
  if (stage === 'RESOLVED') return 'resolved';
  return 'neutral';
}

export function StatusBadge({
  variant = 'neutral',
  children,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
