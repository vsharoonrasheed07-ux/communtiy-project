'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/StatusBadge';

interface AuditRow {
  id: string;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export default function AuditLogPage() {
  const t = useTranslations();
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const qs = actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : '';
      const res = await fetch(`/api/audit-logs${qs}`);
      if (!res.ok) throw new Error('Forbidden');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      setError('Admin access required to view the audit log.');
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">{t('nav.auditLog')}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Tamper-evident record of student views, edits, logins, exports, and automated cron actions.
          </p>
        </div>

        <select
          aria-label="Filter by audit action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="input-field max-w-[180px]"
        >
          <option value="">All actions</option>
          <option value="VIEW">VIEW</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
          <option value="LOGIN">LOGIN</option>
          <option value="LOGIN_FAILED">LOGIN_FAILED</option>
          <option value="EXPORT">EXPORT</option>
          <option value="CRON">CRON</option>
        </select>
      </div>

      {error && (
        <div role="alert" className="card bg-[#F3CDC2] p-4 text-sm font-medium text-[#8F3A2A]">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted">{t('app.loading')}</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">No audit entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E0DDD2] bg-[#FAF9F5] font-medium text-muted">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E6DC]">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">{l.userEmail || 'System'}</span>
                      {l.userRole && <span className="ml-1 text-muted">({l.userRole})</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        variant={
                          l.action === 'LOGIN_FAILED' || l.action === 'DELETE'
                            ? 'high'
                            : l.action === 'VIEW'
                              ? 'info'
                              : 'low'
                        }
                      >
                        {l.action}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {l.entityType}
                      {l.entityId ? ` · ${l.entityId.slice(0, 10)}` : ''}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted">
                      {l.details ? JSON.stringify(l.details) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted">{l.ipAddress || '—'}</td>
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
