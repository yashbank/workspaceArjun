'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { masterSpec, type MasterKey, type MasterListView } from '@/lib/mis/master-directory';
import { saveMasterAction, setDeactivatedAction, type SaveState } from '@/app/(mis)/mis/masters/desktop-actions';

import { useT } from '../shell/locale-provider';

/**
 * D10's edit panel: docked BESIDE the list, so the person changing a machine can still see the others.
 *
 * A plain `<form>` posting to a server action: what is being edited lives in the URL (`?edit=`), nothing is held
 * in a script. The code is present, greyed, and explained — it is the identity, so it is not part of an update.
 * Inputs are 48px with 16px text (a laptop with a keyboard gets no denser form than a tablet).
 */

const input = 'min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900';

export function MasterEditForm({ master, editing, options, closeHref, error = null }: { master: MasterKey; editing: NonNullable<MasterListView['editing']>; options: MasterListView['options']; closeHref: string; error?: string | null }) {
  const t = useT();
  const spec = masterSpec(master)!;
  const [state, action, pending] = useActionState<SaveState, FormData>(saveMasterAction, { error: null });
  const existing = editing.id !== null;

  return (
    <aside aria-label={existing ? t('d10.editTitle') : t('d10.addTitle')} className="flex min-w-0 flex-col rounded-2xl border border-indigo-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{existing ? t('d10.editTitle') : t('d10.addTitle')} · {t(`d10.master.${master}` as never)}</h2>
          {existing && editing.createdAt ? (
            <p className="font-mono text-[11px] text-slate-500">
              {editing.values.code ? `${editing.values.code} · ` : ''}{t('d10.created')} {editing.createdAt.toISOString().slice(0, 10).split('-').reverse().join('/')}
            </p>
          ) : null}
        </div>
        <Link href={closeHref} aria-label={t('d10.close')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-2xl text-slate-500 hover:bg-slate-100">
          ×
        </Link>
      </header>

      <form action={action} className="flex flex-col gap-4 px-5 py-4">
        <input type="hidden" name="master" value={master} />
        {existing ? <input type="hidden" name="id" value={editing.id!} /> : null}

        {spec.fields.map((f) => {
          const id = `d10-${f.key}`;
          const label = t(`d10.field.${f.key}` as never);
          // After a failed save React resets the form: what was typed is handed back and becomes the starting value.
          // A select is keyed on that value: its default does not survive the form reset that follows a failed save.
          const value = state.values?.[f.key] ?? editing.values[f.key] ?? '';
          if (f.identity && existing) {
            return (
              <div key={f.key}>
                <label htmlFor={id} className="mb-1 block text-sm font-semibold text-slate-800">{label}</label>
                {/* Present, greyed and NOT submitted (no name): the code is never part of an update. */}
                <input id={id} value={value} readOnly aria-describedby={`${id}-why`} className={`${input} bg-[#f1ebdf] font-mono text-slate-600`} />
                <p id={`${id}-why`} className="mt-1 text-xs text-slate-500">{t('d10.codeNote')}</p>
              </div>
            );
          }
          return (
            <div key={f.key}>
              <label htmlFor={id} className="mb-1 block text-sm font-semibold text-slate-800">{label}{f.required ? ' *' : ''}</label>
              {f.type === 'select' ? (
                <select key={value} id={id} name={f.key} defaultValue={value} required={f.required} className={input}>
                  <option value="">{t('d10.noneOption')}</option>
                  {(f.options === 'departments' ? options.departments : f.options === 'itemUnits' ? options.itemUnits : options.severities).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input id={id} name={f.key} defaultValue={value} required={f.required} inputMode={f.type === 'number' ? 'decimal' : undefined} className={input} />
              )}
              {f.key === 'nameHi' || f.key === 'labelHi' ? <p className="mt-1 text-xs text-slate-500">{t('d10.hindiNote')}</p> : null}
            </div>
          );
        })}

        {state.error || error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{t('d10.saveFailed')}: {state.error ?? error}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{t('d10.save')}</button>
          <Link href={closeHref} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">{t('d10.cancel')}</Link>
        </div>
      </form>

      {existing ? (
        <form action={setDeactivatedAction} className="border-t border-slate-200 px-5 py-4">
          <input type="hidden" name="master" value={master} />
          <input type="hidden" name="id" value={editing.id!} />
          <input type="hidden" name="deactivate" value={editing.deactivated ? '0' : '1'} />
          <p className="mb-2 text-xs text-slate-500">{editing.deactivated ? t('d10.reactivateNote') : t('d10.deactivateNote')}</p>
          <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-[#f1ebdf] px-4 text-sm font-semibold text-slate-800 hover:bg-slate-200">
            {editing.deactivated ? t('d10.reactivate') : t('d10.deactivate')}
          </button>
        </form>
      ) : null}
    </aside>
  );
}
