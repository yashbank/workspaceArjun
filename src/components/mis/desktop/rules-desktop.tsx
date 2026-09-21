'use client';

import Link from 'next/link';

import { dmy, type HistoryRow, type RuleView, type RulesLedgerView } from '@/lib/mis/rules-ledger';
import { cn } from '@/lib/utils';

import { useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';
import { RulesChangeForm } from './rules-change-form';

/**
 * D12 — "Changing a rule must never change the past."
 *
 * Owner only, and absent (not disabled) for everyone else. The list shows the value in force on the chosen day;
 * the panel beside it schedules a NEW row and shows the history. No row can be edited or deleted here — a wrong
 * value is corrected by adding another row, so the mistake and the correction are both on the record.
 *
 * **Left out, said plainly:** the artboard claims "every screen reads a rule as of a date". Today most readers
 * use the value in force NOW (`getRuleValue`) — a claim this screen must not make until they change (F-22). Units
 * (`%`, `min`, `days`) are not recorded on a rule, so none is invented. A rule appears once it has a row.
 */

const base = '/mis/settings/rules';
const href = (asOf: string, todayKey: string, rule?: string | null) => {
  const q = new URLSearchParams();
  if (rule) q.set('rule', rule);
  if (asOf !== todayKey) q.set('asOf', asOf);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
};

export function RulesDesktop({ view, denied = false, scheduled = false }: { view: RulesLedgerView | null; denied?: boolean; scheduled?: boolean }) {
  const t = useT();
  if (denied) return <p role="alert" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">{t('d12.noAccess')}</p>;
  if (!view) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{t('d12.loadFailed')}</p>
        <Link href="/mis/settings" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">{t('d12.openClassic')}</Link>
      </div>
    );
  }

  const selected = view.rules.find((r) => r.ruleKey === view.selectedKey) ?? null;
  const today = view.asOf === view.todayKey;
  const summary = [
    `${view.rules.length} ${t('d12.rules')}`,
    `${t('d12.inForceOn')} ${dmy(view.asOf)}`,
    view.scheduledCount > 0 ? `${view.scheduledCount} ${view.scheduledCount === 1 ? t('d12.scheduledOne') : t('d12.scheduledMany')}` : t('d12.noneScheduled'),
  ].join(' · ');

  return (
    <div>
      <nav aria-label={t('d12.breadcrumb')} className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/mis/settings" className="inline-flex min-h-11 items-center hover:underline">{t('d12.crumb.settings')}</Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-slate-900">{t('d12.title')}</span>
      </nav>

      <DesktopPageHeader
        title={t('d12.title')}
        summary={summary}
        secondary={
          <>
            {/* A plain GET form: choosing a day is a read, never a change. */}
            <form method="get" action={base} className="flex items-center gap-2">
              {selected ? <input type="hidden" name="rule" value={selected.ruleKey} /> : null}
              <label htmlFor="d12-asof" className="text-sm font-semibold text-slate-700">{t('d12.asOf')}</label>
              <input id="d12-asof" type="date" name="asOf" defaultValue={view.asOf} className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 font-mono text-base" />
              <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100">{t('d12.show')}</button>
            </form>
            <Link href="/mis/audit" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100">{t('d12.changeLog')}</Link>
          </>
        }
      />

      {scheduled ? <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{t('d12.scheduled')}</p> : null}

      {view.rules.length === 0 ? (
        <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">{t('d12.emptyTitle')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{t('d12.emptyBody')}</p>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section aria-label={today ? t('d12.today') : `${t('d12.inForceOn')} ${dmy(view.asOf)}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
            <header className="mb-2 flex items-center justify-between gap-3 px-2">
              <h2 className="text-base font-bold text-slate-900">{today ? t('d12.today') : `${t('d12.inForceOn')} ${dmy(view.asOf)}`}</h2>
              <span className="text-xs text-slate-500">{t('d12.columns')}</span>
            </header>
            <ul className="flex flex-col gap-1.5">
              {view.rules.map((r) => (
                <RuleRow key={r.ruleKey} rule={r} active={r.ruleKey === view.selectedKey} sensitive={view.sensitiveKeys.includes(r.ruleKey)} to={href(view.asOf, view.todayKey, r.ruleKey)} />
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-[#f1ebdf] px-3 py-2.5 text-sm text-slate-700">
              <span aria-hidden="true">ⓘ</span>
              <span>{t('d12.honestNote')}</span>
            </p>
          </section>

          {selected ? (
            <div className="flex min-w-0 flex-col gap-5">
              <RulesChangeForm key={selected.ruleKey} rule={selected} todayKey={view.todayKey} cancelHref={href(view.asOf, view.todayKey)} />
              <History rule={selected} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, active, sensitive, to }: { rule: RuleView; active: boolean; sensitive: boolean; to: string }) {
  const t = useT();
  return (
    <li>
      <Link
        href={to}
        aria-current={active ? 'true' : undefined}
        className={cn('grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 rounded-xl border px-4 py-3', active ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-slate-100')}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-900">
            {rule.label}
            {sensitive ? <span className="ml-2 rounded bg-slate-900 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-white">{t('d12.ownerOnly')}</span> : null}
          </span>
          <span className="block truncate font-mono text-[11px] text-slate-500">{rule.ruleKey}</span>
        </span>
        {rule.value === null ? (
          <span className="text-sm text-slate-500">{t('d12.notStarted')}</span>
        ) : (
          <span className="max-w-[16rem] truncate text-right font-mono text-base font-bold text-slate-900">{rule.value}</span>
        )}
        <span className="w-24 text-right font-mono text-xs text-slate-500">{rule.from ? dmy(rule.from) : '—'}</span>
      </Link>
    </li>
  );
}

function History({ rule }: { rule: RuleView }) {
  const t = useT();
  return (
    <section aria-label={`${t('d12.history')} · ${rule.ruleKey}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-bold text-slate-900">{t('d12.history')} · <span className="font-mono">{rule.ruleKey}</span></h2>
        <span className="shrink-0 text-xs text-slate-500">{rule.history.length} {t('d12.rows')}</span>
      </header>
      <ol className="flex flex-col gap-3 border-l-2 border-slate-200 pl-4">
        {rule.history.map((h) => <HistoryItem key={h.id} h={h} />)}
      </ol>
      <p className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600">{t('d12.noEdit')}</p>
    </section>
  );
}

function HistoryItem({ h }: { h: HistoryRow }) {
  const t = useT();
  const range = h.until ? `${dmy(h.from)} – ${dmy(h.until)}` : `${t('d12.from')} ${dmy(h.from)}`;
  return (
    <li className={cn('min-w-0', h.status === 'inforce' && '-ml-[1.15rem] border-l-4 border-indigo-600 pl-3')}>
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-base font-bold text-slate-900">{h.value}</span>
        {h.status === 'scheduled' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t('d12.status.scheduled')}</span> : null}
        {h.status === 'inforce' ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{t('d12.status.inforce')}</span> : null}
      </p>
      <p className="font-mono text-xs text-slate-500">
        {range} · {h.seeded ? t('d12.seeded') : h.by ?? t('d12.unknownPerson')}
      </p>
      {h.reason ? <p className="mt-0.5 text-sm text-slate-700">{h.reason}</p> : null}
    </li>
  );
}
