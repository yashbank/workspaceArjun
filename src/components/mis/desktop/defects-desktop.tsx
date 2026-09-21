'use client';

import Link from 'next/link';

import { MULTI_MACHINE, NO_MACHINE, SEVERITIES, UNCLASSIFIED, type DefectReportView, type Severity } from '@/lib/mis/defects';
import { seriesHue } from '@/lib/mis/chart';
import { cn } from '@/lib/utils';

import { useMisLocale, useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';

/**
 * D14 — "Sorted, cut at 80%, and traced — otherwise it is only a list of bad news."
 *
 * Every figure comes from the one `DefectReportView` the server built. What the artboard shows that nothing
 * records is left out and SAID, in one card: the disposition (reworked / scrapped / accepted with deviation),
 * rework time, and the cost of poor quality. That last one is money (D24, the Owner's) with no source at all —
 * it is not computed, not in the payload, and not drawn for anyone. There is also no defect RATE: a defect
 * quantity has no unit and machine output is not recorded in a matching one, so machines are ranked by
 * quantity and the screen says so instead of quietly ranking by the busiest machine.
 *
 * Severity is the defect-type master's. A check's defect type is free text; only text that matches a master is
 * classified, the rest says "not classified".
 */

const num = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
const pct = (n: number) => `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(n)}%`;

const SEV_CHIP: Record<Severity | typeof UNCLASSIFIED, string> = {
  CRITICAL: 'border-red-200 bg-red-50 text-red-800',
  MAJOR: 'border-amber-200 bg-amber-50 text-amber-900',
  MINOR: 'border-slate-300 bg-[#f1ebdf] text-slate-700',
  // Dashed = no severity recorded: an absence of data, not a recorded MINOR.
  UNCLASSIFIED: 'border-dashed border-slate-400 bg-transparent text-slate-500',
};

const query = (q: { month: string; machine?: string | null; severity?: string | null }) => {
  const p = new URLSearchParams({ month: q.month });
  if (q.machine) p.set('machine', q.machine);
  if (q.severity) p.set('severity', q.severity);
  return `/mis/qc/defects?${p.toString()}`;
};

export function DefectsDesktop({ view, denied = false }: { view: DefectReportView | null; denied?: boolean }) {
  const t = useT();
  const { locale } = useMisLocale();
  if (denied) return <p role="alert" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">{t('d14.noAccess')}</p>;
  if (!view) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{t('d14.loadFailed')}</p>
        <Link href="/mis/qc" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">{t('d14.openChecks')}</Link>
      </div>
    );
  }

  const intl = locale === 'hi' ? 'hi-IN' : 'en-IN';
  const monthName = (key: string, style: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat(intl, { month: style, year: style === 'long' ? 'numeric' : undefined, timeZone: 'UTC' }).format(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)));
  const machineLabel = (key: string) => (key === MULTI_MACHINE ? t('d14.several') : key === NO_MACHINE ? t('d14.noBooking') : key);
  const sevLabel = (s: Severity | typeof UNCLASSIFIED) => t(`d14.severity.${s}` as never);
  const { filters } = view;
  const maxReason = Math.max(0, ...view.reasons.map((r) => r.qty));
  const maxMachine = Math.max(0, ...view.machines.map((m) => m.qty));
  const dmy = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
        <span>{t('d14.crumb.quality')}</span>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-slate-900">{t('d14.crumb.defects')}</span>
      </nav>

      <DesktopPageHeader
        title={t('d14.title')}
        summary={`${monthName(view.monthKey)}${view.running ? ` · ${t('d14.running')}` : ''} · ${view.entries} ${t('d14.entries')} · ${num(view.quantity)} ${t('d14.defective')} · ${t('d14.traces')}`}
        secondary={
          <>
            <nav aria-label={t('d14.monthNav')} className="flex items-center gap-2">
              <Link href={query({ month: view.prevKey, machine: filters.machine, severity: filters.severity })} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                ‹ {monthName(view.prevKey, 'short')}
              </Link>
              {view.nextKey ? (
                <Link href={query({ month: view.nextKey, machine: filters.machine, severity: filters.severity })} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {monthName(view.nextKey, 'short')} ›
                </Link>
              ) : null}
            </nav>
            {/* A plain GET form: no script decides what is filtered. */}
            <form method="get" action="/mis/qc/defects" className="flex items-center gap-2">
              <input type="hidden" name="month" value={view.monthKey} />
              <label className="sr-only" htmlFor="d14-machine">{t('d14.machine')}</label>
              <select id="d14-machine" name="machine" defaultValue={filters.machine ?? ''} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
                <option value="">{t('d14.machine')}: {t('d14.allMachines')}</option>
                {[...view.available.machines, ...(filters.machine && filters.machine !== MULTI_MACHINE && filters.machine !== NO_MACHINE && !view.available.machines.includes(filters.machine) ? [filters.machine] : [])].map((m) => <option key={m} value={m}>{m}</option>)}
                {view.available.hasMulti || filters.machine === MULTI_MACHINE ? <option value={MULTI_MACHINE}>{t('d14.several')}</option> : null}
                {view.available.hasNoMachine || filters.machine === NO_MACHINE ? <option value={NO_MACHINE}>{t('d14.noBooking')}</option> : null}
              </select>
              <label className="sr-only" htmlFor="d14-severity">{t('d14.severity')}</label>
              <select id="d14-severity" name="severity" defaultValue={filters.severity ?? ''} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
                <option value="">{t('d14.severity')}: {t('d14.allSeverities')}</option>
                {([...view.available.severities, ...(filters.severity && !(view.available.severities as string[]).includes(filters.severity) ? [filters.severity as Severity] : [])] as (Severity | typeof UNCLASSIFIED)[]).map((s) => <option key={s} value={s}>{sevLabel(s)}</option>)}
              </select>
              <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">{t('d14.apply')}</button>
            </form>
          </>
        }
        primary={
          <Link href="/mis/qc/grid" className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">
            {t('d14.hourlyChecks')}
          </Link>
        }
      />

      {filters.machine || filters.severity ? (
        <p role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-900">
          <span>
            {t('d14.filtered')}
            {filters.machine ? ` · ${t('d14.machine')}: ${machineLabel(filters.machine)}` : ''}
            {filters.severity ? ` · ${t('d14.severity')}: ${sevLabel(filters.severity as Severity)}` : ''}
          </span>
          <Link href={query({ month: view.monthKey })} className="inline-flex min-h-11 items-center font-semibold underline">{t('d14.clearFilters')}</Link>
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardTitle>{t('d14.qtyTitle')}</CardTitle>
          <p className="font-mono text-3xl font-bold text-slate-900">{num(view.quantity)}</p>
          <p className="mt-1 text-sm text-slate-600">{view.entries} {t('d14.entries')}</p>
          {view.withoutQuantity > 0 ? <p className="text-sm font-medium text-amber-900">{view.withoutQuantity} {t('d14.noQuantity')}</p> : null}
          <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d14.qtyNote')}</p>
        </Card>

        <Card>
          <CardTitle>{t('d14.severityTitle')}</CardTitle>
          {view.quantity > 0 ? (
            <span className="mb-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={t('d14.severityTitle')}>
              {([...SEVERITIES, UNCLASSIFIED] as const).map((s) => {
                const w = view.severityShare[s];
                return w > 0 ? <span key={s} className={cn('h-full', s === 'CRITICAL' && 'bg-red-600', s === 'MAJOR' && 'bg-amber-600', s === 'MINOR' && 'bg-slate-500', s === UNCLASSIFIED && 'bg-slate-300')} style={{ width: `${w}%` }} /> : null;
              })}
            </span>
          ) : null}
          <ul className="flex flex-col gap-1 text-sm" aria-label={t('d14.legendLabel')}>
            {([...SEVERITIES, UNCLASSIFIED] as const).map((s) => (
              <li key={s} className="flex items-center justify-between">
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', SEV_CHIP[s])}>{sevLabel(s)}</span>
                <span className="font-mono text-slate-800">{num(view.severity[s])}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d14.severityNote')}</p>
        </Card>

        <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5">
          <CardTitle>{t('d14.notRecordedTitle')}</CardTitle>
          <ul className="flex flex-col gap-1.5 text-sm text-slate-700">
            <li>{t('d14.nr.decided')}</li>
            <li>{t('d14.nr.time')}</li>
            <li>{t('d14.nr.cost')}</li>
          </ul>
          <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d14.nr.why')}</p>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card>
          <CardTitle right={view.top3Share !== null ? `${t('d14.top3')} = ${pct(view.top3Share)}` : t('d14.reasonsNote')}>{t('d14.reasonsTitle')}</CardTitle>
          {view.reasons.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{filters.machine || filters.severity ? t('d14.noMatch') : t('d14.noReasons')}</p>
          ) : (
            <table className="w-full border-collapse text-sm" aria-label={t('d14.reasonsTitle')}>
              <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="pb-2 font-medium">{t('d14.col.reason')}</th>
                  <th scope="col" className="pb-2 font-medium"><span className="sr-only">{t('d14.col.bar')}</span></th>
                  <th scope="col" className="pb-2 text-right font-medium">{t('d14.col.qty')}</th>
                  <th scope="col" className="pb-2 pl-3 text-right font-medium">{t('d14.col.cumulative')}</th>
                </tr>
              </thead>
              <tbody>
                {view.reasons.map((r, i) => (
                  <ReasonRows key={r.key}>
                    <tr className="border-b border-slate-100">
                      <th scope="row" className="w-1/3 py-2 pr-3 text-left font-normal text-slate-900">
                        <span className="block">{r.label ?? <span className="italic text-slate-500">{t('d14.notStated')}</span>}</span>
                        <span className={cn('mt-0.5 inline-block rounded border px-1.5 text-[10px] font-bold uppercase tracking-wider', SEV_CHIP[r.severity ?? UNCLASSIFIED])}>{sevLabel(r.severity ?? UNCLASSIFIED)}</span>
                      </th>
                      <td className="py-2 pr-3">
                        <span className="block h-3 overflow-hidden rounded-full bg-[#f1ebdf]" role="img" aria-label={`${r.label ?? t('d14.notStated')}: ${num(r.qty)}`}>
                          <span className="block h-full rounded-full" style={{ width: `${maxReason > 0 ? (r.qty / maxReason) * 100 : 0}%`, backgroundColor: seriesHue(0) }} />
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono font-semibold text-slate-900">{num(r.qty)}</td>
                      <td className="py-2 pl-3 text-right font-mono text-xs text-slate-500">{pct(r.cumulative)}</td>
                    </tr>
                    {view.cutAfter === i && i < view.reasons.length - 1 ? (
                      <tr>
                        <td colSpan={4} className="border-y border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <strong>{t('d14.cutLine')}</strong> {i + 1} {t('d14.cutReasons')} {view.reasons.length} {t('d14.cutCarry')} {pct(r.cumulative)} {t('d14.cutTail')}
                        </td>
                      </tr>
                    ) : null}
                  </ReasonRows>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <CardTitle right={t('d14.machinesNote')}>{t('d14.machinesTitle')}</CardTitle>
          {view.machines.length === 0 ? (
            <p className="text-sm text-slate-500">{t('d14.noMachines')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {view.machines.map((m) => (
                <li key={m.key} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className={cn('truncate', (m.key === MULTI_MACHINE || m.key === NO_MACHINE) && 'italic text-slate-500')}>{machineLabel(m.key)}</span>
                  <span className={cn('h-3 overflow-hidden rounded-full bg-[#f1ebdf]', (m.key === MULTI_MACHINE || m.key === NO_MACHINE) && 'border border-dashed border-slate-400 bg-transparent')} role="img" aria-label={`${machineLabel(m.key)}: ${num(m.qty)}`}>
                    <span className={cn('block h-full rounded-full', (m.key === MULTI_MACHINE || m.key === NO_MACHINE) && 'bg-slate-400')} style={{ width: `${maxMachine > 0 ? (m.qty / maxMachine) * 100 : 0}%`, ...(m.key === MULTI_MACHINE || m.key === NO_MACHINE ? {} : { backgroundColor: seriesHue(0) }) }} />
                  </span>
                  <span className="font-mono text-xs text-slate-700">{num(m.qty)} <span className="text-slate-500">· {m.entries}</span></span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 font-mono text-[11px] text-slate-500">{t('d14.machinesCaveat')}</p>
        </Card>
      </div>

      {view.drill ? (
        <Card className="mt-5">
          <CardTitle right={view.drill.reason.label ?? t('d14.notStated')}>{t('d14.drillTitle')}</CardTitle>
          <ol className="grid gap-4 lg:grid-cols-3">
            <Step n={1} title={`${filters.machine ? `${t('d14.drill1Within')} ${machineLabel(filters.machine)}` : t('d14.drill1')}: ${view.drill.reason.label ?? t('d14.notStated')}`} value={num(view.drill.reason.qty)} sub={pct(view.drill.reason.share)} />
            {view.drill.machine ? (
              <Step n={2} title={`${t('d14.drill2')} ${view.drill.machine.name}`} value={num(view.drill.machine.qty)} sub={`${pct(view.drill.machine.shareOfReason)} ${t('d14.ofStep')}`} />
            ) : (
              <Step n={2} title={t('d14.drillNoMachine')} />
            )}
            {view.drill.machine && view.drill.shift ? (
              <Step n={3} title={`${t('d14.drill3')} ${view.drill.shift.name}`} value={num(view.drill.shift.qty)} sub={`${pct(view.drill.shift.shareOfMachine)} ${t('d14.ofStep')}`} />
            ) : view.drill.machine ? (
              <Step n={3} title={t('d14.drillNoShift')} />
            ) : null}
          </ol>
        </Card>
      ) : null}

      <Card className="mt-5">
        <CardTitle right={`${t('d14.showing')} ${view.log.length} ${t('d14.of')} ${view.logTotal} · ${t('d14.logNote')}`}>{t('d14.logTitle')}</CardTitle>
        {view.log.length === 0 ? (
          <p className="text-sm text-slate-500">{filters.machine || filters.severity ? t('d14.noMatch') : t('d14.noReasons')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" aria-label={t('d14.logTitle')}>
              <thead>
                <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="py-2 font-medium">{t('d14.col.date')}</th>
                  <th scope="col" className="py-2 font-medium">{t('d14.col.order')}</th>
                  <th scope="col" className="py-2 font-medium">{t('d14.col.machine')}</th>
                  <th scope="col" className="py-2 font-medium">{t('d14.col.defect')}</th>
                  <th scope="col" className="py-2 font-medium">{t('d14.col.severity')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('d14.col.qty')}</th>
                  <th scope="col" className="py-2 pl-4 font-medium">{t('d14.col.by')}</th>
                </tr>
              </thead>
              <tbody>
                {view.log.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 font-mono text-xs text-slate-600">{dmy(row.dateKey)} {row.timeLabel}</td>
                    <th scope="row" className="py-2 text-left font-mono font-normal">
                      <Link href={`/mis/orders/${row.orderId}`} className="inline-flex min-h-11 items-center text-indigo-700 hover:underline">{row.orderNumber}</Link>
                    </th>
                    <td className={cn('py-2', (row.machine === MULTI_MACHINE || row.machine === NO_MACHINE) && 'italic text-slate-500')}>{machineLabel(row.machine)}</td>
                    <td className="py-2">{row.reasonLabel ?? <span className="italic text-slate-500">{t('d14.notStated')}</span>}</td>
                    <td className="py-2"><span className={cn('rounded border px-1.5 text-[10px] font-bold uppercase tracking-wider', SEV_CHIP[row.severity ?? UNCLASSIFIED])}>{sevLabel(row.severity ?? UNCLASSIFIED)}</span></td>
                    <td className="py-2 text-right font-mono font-semibold">{row.qty === null ? '—' : num(row.qty)}</td>
                    <td className="py-2 pl-4 text-slate-700">{row.by ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d14.logFoot')}</p>
      </Card>
    </div>
  );
}

function ReasonRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Step({ n, title, value, sub }: { n: number; title: string; value?: string; sub?: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-mono text-xs font-bold text-indigo-800">{n}</span>
      <div className="min-w-0">
        <p className="text-sm text-slate-800">{title}</p>
        {value ? <p className="font-mono text-xl font-bold text-slate-900">{value}</p> : null}
        {sub ? <p className="font-mono text-xs text-slate-500">{sub}</p> : null}
      </div>
    </li>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('min-w-0 rounded-2xl border border-slate-200 bg-white p-5', className)}>{children}</section>;
}

function CardTitle({ children, right }: { children: React.ReactNode; right?: string }) {
  return (
    <header className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
      {right ? <span className="text-right text-xs text-slate-500">{right}</span> : null}
    </header>
  );
}
