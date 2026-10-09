'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { recordChecklistCheckAction } from '@/app/(mis)/mis/qc/actions';
import { Select } from '@/components/mis/kit/select';
import { CHECKLIST_LABELS, CHECKLIST_STATUSES, buildChecklist, type ChecklistCheck, type ChecklistStatus } from '@/lib/mis/qc-template';
import type { QcTemplateRow } from '@/server/mis/qc-template';
import { cn } from '@/lib/utils';

/**
 * The paper form on a phone: parameters down, hourly slots across, tap a cell and pick one of
 * the four buttons. Every tap is a QC check (templateId + slotTime), so the grid, the CoA and the
 * Supervisor's blocker see it like any other.
 */
const TONE: Record<ChecklistStatus, string> = {
  PASS: 'bg-green-100 text-green-800 border-green-300',
  FAIL: 'bg-red-100 text-red-800 border-red-300',
  MAKE_READY: 'bg-slate-100 text-slate-600 border-slate-300',
  PLATE_ERR: 'bg-amber-100 text-amber-800 border-amber-300',
};
const SHORT: Record<ChecklistStatus, string> = { PASS: 'P', FAIL: 'F', MAKE_READY: 'MR', PLATE_ERR: 'PE' };

export function QcChecklist({ orderId, templates, checks, canWrite }: { orderId: string; templates: QcTemplateRow[]; checks: (ChecklistCheck & { templateId?: string | null })[]; canWrite: boolean }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [active, setActive] = useState<{ parameter: string; slot: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const template = templates.find((t) => t.id === templateId);
  if (!template) return null;

  const rows = buildChecklist(template.parameters, template.slots, checks.filter((c) => c.templateId === template.id));

  const tap = (status: ChecklistStatus) => {
    if (!active) return;
    const cell = active;
    setActive(null);
    startTransition(async () => {
      await recordChecklistCheckAction({ orderId, templateId: template.id, parameterName: cell.parameter, slotTime: cell.slot, status });
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
        <div className="font-medium text-gray-700">Checklist</div>
        <div className="flex items-center gap-2">
          <div className="w-56"><Select label="Form" value={templateId} onChange={setTemplateId} options={templates.map((t) => ({ value: t.id, label: t.name }))} /></div>
          <a href={`/mis/print/qc-checklist/${orderId}?template=${template.id}`} target="_blank" className="inline-flex min-h-11 items-center text-sm text-blue-600 hover:underline">🖨 A4</a>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium">Parameter</th>
              {template.slots.map((s) => <th key={s} className="px-1 py-2 font-medium">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.parameter} className="border-t border-gray-100">
                <td className="sticky left-0 bg-white px-3 py-1 text-left text-sm text-gray-800">{row.parameter}</td>
                {row.cells.map((cell) => {
                  const isActive = active?.parameter === row.parameter && active.slot === cell.slot;
                  return (
                    <td key={cell.slot} className="px-0.5 py-1 text-center">
                      <button
                        type="button"
                        disabled={!canWrite || isPending}
                        aria-label={`${row.parameter} at ${cell.slot}: ${cell.status ? CHECKLIST_LABELS[cell.status] : 'not checked'}`}
                        aria-pressed={isActive}
                        onClick={() => setActive(isActive ? null : { parameter: row.parameter, slot: cell.slot })}
                        className={cn('min-h-11 min-w-11 rounded-lg border text-xs font-semibold', cell.status ? TONE[cell.status] : 'border-dashed border-gray-300 text-gray-400', isActive && 'ring-2 ring-indigo-500')}
                      >
                        {cell.status ? SHORT[cell.status] : '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active && canWrite && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3">
          <span className="text-sm text-gray-600">{active.parameter} · {active.slot}:</span>
          {CHECKLIST_STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => tap(s)} disabled={isPending} className={cn('min-h-11 rounded-lg border px-4 text-sm font-semibold', TONE[s])}>{CHECKLIST_LABELS[s]}</button>
          ))}
        </div>
      )}
    </div>
  );
}
