'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate as fmtFactoryDate, fmtTime as fmtFactoryTime } from '@/lib/mis/client-dates';

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string;
  createdAt: Date | string;
  changes: { path: string; from: string; to: string }[];
  severity: string | null;
};

interface Props {
  logs: AuditRow[];
  initialFrom: string;
  initialTo: string;
}

const entityColors: Record<string, string> = {
  order: 'bg-blue-100 text-blue-700',
  bom: 'bg-purple-100 text-purple-700',
  production: 'bg-yellow-100 text-yellow-700',
  attendance: 'bg-green-100 text-green-700',
  employee: 'bg-gray-100 text-gray-700',
  qc: 'bg-orange-100 text-orange-700',
  po: 'bg-indigo-100 text-indigo-700',
  grn: 'bg-teal-100 text-teal-700',
};

function fmtTime(dt: Date | string) {
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  return fmtFactoryDate(d, { day: '2-digit', month: 'short' }) + ' ' + fmtFactoryTime(d, { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function AuditScreen({ logs, initialFrom, initialTo }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);

  const applyDateRange = (nextFrom: string, nextTo: string) => {
    const params = new URLSearchParams();
    if (nextFrom) params.set('from', nextFrom);
    if (nextTo) params.set('to', nextTo);
    router.push(params.size > 0 ? `/mis/audit?${params.toString()}` : '/mis/audit');
  };

  const entities = useMemo(() => {
    const set = new Set(logs.map(l => l.entity));
    return ['', ...Array.from(set).sort()];
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (entityFilter && l.entity !== entityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return l.action.toLowerCase().includes(q) || l.actorName.toLowerCase().includes(q) || l.entity.toLowerCase().includes(q);
      }
      return true;
    });
  }, [logs, search, entityFilter]);

  return (
    <div className="max-w-5xl mx-auto space-y-5 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Audit Log</h1>
        <span className="text-sm text-gray-400">{filtered.length} of {logs.length} events</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="min-h-12 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search actions, actors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
        >
          <option value="">All entities</option>
          {entities.filter(Boolean).map(e => (
            <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-2 text-base text-gray-500">
          <span>From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); applyDateRange(e.target.value, toDate); }}
            className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span>To</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); applyDateRange(fromDate, e.target.value); }}
            className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); applyDateRange('', ''); }}
              className="inline-flex min-h-11 items-center text-base text-gray-500 hover:text-gray-700 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No audit events found.</div>
        ) : (
          filtered.map((log) => (
            <details key={log.id} className="group hover:bg-gray-50">
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 [&::-webkit-details-marker]:hidden">
                <div className="text-xs text-gray-400 whitespace-nowrap sm:w-36 shrink-0">{fmtTime(log.createdAt)}</div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${entityColors[log.entity] ?? 'bg-gray-100 text-gray-600'}`}>
                  {log.entity}
                </span>
                {log.severity === 'WARNING' && (
                  <span className="text-xs px-2 py-0.5 rounded font-medium shrink-0 bg-amber-100 text-amber-800">Warning</span>
                )}
                <div className="min-w-0 flex-1 basis-40 break-words">
                  <span className="text-sm font-medium text-gray-800">{log.action.replace(/_/g, ' ').replace(/\./g, ' › ')}</span>
                  {log.entityId && (
                    <span className="ml-2 break-all text-xs text-gray-400 font-mono">{log.entityId.slice(0, 8)}…</span>
                  )}
                </div>
                <div className="text-sm text-gray-500 shrink-0">{log.actorName}</div>
                <span className="text-xs text-gray-400 shrink-0">{log.changes.length > 0 ? `${log.changes.length} change${log.changes.length === 1 ? '' : 's'}` : 'no detail'}</span>
              </summary>
              {log.changes.length > 0 && (
                <ul className="space-y-2 bg-gray-50 px-5 py-3 text-sm">
                  {log.changes.map((c) => (
                    <li key={c.path} className="min-w-0 break-words">
                      <span className="font-mono text-xs text-gray-500">{c.path}</span>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="break-all text-red-700 line-through decoration-red-300">{c.from}</span>
                        <span aria-hidden className="text-gray-400">→</span>
                        <span className="break-all font-medium text-green-700">{c.to}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))
        )}
      </div>
    </div>
  );
}
