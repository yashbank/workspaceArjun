'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { scheduleRuleAction, type ScheduleState } from '@/app/(mis)/mis/settings/rules/actions';
import type { RuleView } from '@/lib/mis/rules-ledger';

import { useT } from '../shell/locale-provider';

/**
 * D12's change panel. The button says "Schedule change", not "Save", because that is what happens: a NEW row is
 * written with a start day and the old row keeps its range. The reason is required and says why in the words the
 * next person will read. A failed change hands back what was typed (React resets a form after an action), so a
 * missing reason never costs the Owner the value they had already worked out.
 */

const field = 'min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900';

export function RulesChangeForm({ rule, todayKey, cancelHref }: { rule: RuleView; todayKey: string; cancelHref: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<ScheduleState, FormData>(scheduleRuleAction, { error: null });
  const shown = state.error;

  return (
    <section aria-label={`${t('d12.changeTitle')} · ${rule.label}`} className="flex min-w-0 flex-col rounded-2xl border border-indigo-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="min-w-0 text-lg font-bold text-slate-900">{t('d12.changeTitle')} · {rule.label}</h2>
        <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{t('d12.newRow')}</span>
      </header>

      <form action={action} className="flex flex-col gap-4 px-5 py-4">
        <input type="hidden" name="ruleKey" value={rule.ruleKey} />
        {shown ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{shown}</p> : null}

        <div>
          <label htmlFor="d12-value" className="mb-1 block text-sm font-semibold text-slate-800">{t('d12.newValue')}</label>
          <input id="d12-value" name="ruleValue" required defaultValue={state.values?.ruleValue ?? ''} inputMode={rule.valueType === 'number' ? 'decimal' : 'text'} autoComplete="off" className={`${field} font-mono`} />
        </div>

        <div>
          <label htmlFor="d12-from" className="mb-1 block text-sm font-semibold text-slate-800">{t('d12.effectiveFrom')}</label>
          <input id="d12-from" name="effectiveFrom" type="date" required min={todayKey} defaultValue={state.values?.effectiveFrom ?? ''} aria-describedby="d12-from-note" className={`${field} font-mono`} />
          <p id="d12-from-note" className="mt-1 text-xs text-slate-500">
            {rule.value !== null ? t('d12.keepsNote').replace('{value}', rule.value) : t('d12.keepsNoteNone')}
            {' '}{t('d12.nothingRewritten')}
          </p>
        </div>

        <div>
          <label htmlFor="d12-reason" className="mb-1 block text-sm font-semibold text-slate-800">{t('d12.reason')}</label>
          <textarea id="d12-reason" name="reason" required rows={3} maxLength={500} defaultValue={state.values?.reason ?? ''} aria-describedby="d12-reason-note" className={`${field} py-2`} />
          <p id="d12-reason-note" className="mt-1 text-xs text-slate-500">{t('d12.reasonNote')}</p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link href={cancelHref} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100">{t('d12.cancel')}</Link>
          <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {pending ? t('d12.scheduling') : t('d12.schedule')}
          </button>
        </div>
      </form>
    </section>
  );
}
