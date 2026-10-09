'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { createQcTemplateAction, seedQcTemplatesAction, setQcTemplateActiveAction, updateQcTemplateAction } from '@/app/(mis)/mis/settings/qc-templates/actions';
import { Button } from '@/components/mis/kit/button';
import { Input, TimeInput } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import type { QcTemplateRow } from '@/server/mis/qc-template';

type Draft = { name: string; processName: string; slotStart: string; slotEnd: string; parameters: string };
const EMPTY: Draft = { name: '', processName: '', slotStart: '09:15', slotEnd: '18:00', parameters: '' };
const toDraft = (t: QcTemplateRow): Draft => ({ name: t.name, processName: t.processName ?? '', slotStart: t.slotStart, slotEnd: t.slotEnd, parameters: t.parameters.join('\n') });
const toInput = (d: Draft) => ({ name: d.name, processName: d.processName || null, slotStart: d.slotStart, slotEnd: d.slotEnd, parameters: d.parameters.split('\n') });

export function QcTemplateSettingsScreen({ templates }: { templates: QcTemplateRow[] }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = (t?: QcTemplateRow) => { setEditing(t ? t.id : 'new'); setDraft(t ? toDraft(t) : EMPTY); setError(null); };
  const save = () => startTransition(async () => {
    try {
      if (editing === 'new') await createQcTemplateAction(toInput(draft));
      else if (editing) await updateQcTemplateAction(editing, toInput(draft));
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'That did not save.'); }
  });
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/mis/settings" className="inline-flex min-h-11 w-fit items-center text-base text-slate-500 hover:text-slate-700">← Settings</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">QC checklist templates</h1>
          <p className="text-sm text-slate-500">One per paper form. Parameters down the side, an hourly slot per column from the first check to the last.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => startTransition(async () => { await seedQcTemplatesAction(); })} disabled={isPending}>Restore defaults</Button>
          <Button onClick={() => open()} disabled={isPending}>+ New template</Button>
        </div>
      </div>

      {editing && (
        <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <Input label="Name" value={draft.name} onChange={set('name')} />
          <Input label="Process (shown on the form)" value={draft.processName} onChange={set('processName')} />
          <div className="grid grid-cols-2 gap-3">
            <TimeInput label="First check" value={draft.slotStart} onChange={set('slotStart')} />
            <TimeInput label="Last check" value={draft.slotEnd} onChange={set('slotEnd')} />
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Parameters — one per line
            <textarea className="min-h-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900" value={draft.parameters} onChange={set('parameters')} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {templates.length === 0 && <p className="py-8 text-center text-slate-400">No templates yet — restore the defaults or add one.</p>}
      {templates.map((t) => (
        <div key={t.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 font-semibold text-slate-900">{t.name} {!t.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}</div>
              <div className="text-sm text-slate-500">{t.processName ?? '—'} · {t.slots.length} slots {t.slotStart}–{t.slotEnd} · {t.parameters.length} parameters</div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => open(t)} disabled={isPending}>Edit</Button>
              <Button variant="ghost" onClick={() => startTransition(async () => { await setQcTemplateActiveAction(t.id, !t.isActive); })} disabled={isPending}>{t.isActive ? 'Deactivate' : 'Activate'}</Button>
            </div>
          </div>
          <ol className="list-decimal pl-5 text-sm text-slate-700">{t.parameters.map((p) => <li key={p}>{p}</li>)}</ol>
        </div>
      ))}
    </div>
  );
}
