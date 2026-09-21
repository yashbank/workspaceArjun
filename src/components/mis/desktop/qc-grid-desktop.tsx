'use client';

import Link from 'next/link';

import type { QcGridView, SlotState } from '@/lib/mis/qc-grid';
import { cn } from '@/lib/utils';

import { useMisLocale, useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';

/**
 * D9 — "A missing check is not a passing check."
 *
 * Every figure is a tally of the cells drawn (`identityHolds` says so, and the screen says so if it
 * ever does not). Five states, never collapsed: passed, failed, make-ready (grey — something WAS
 * recorded and it was N/A), not taken (DASHED — nothing recorded and the hour is over, an absence of
 * data, MIS_UI_SPEC §4.4 rule 6) and not due yet (faint — the hour has not ended). The columns come
 * from the shift definition, so changing the shift in settings changes this grid.
 *
 * Left out and said: the artboard's "Failed · defect raised" (a failed check does not record whether a
 * defect was raised) and the AQL "of 40,000" lot size (orders carry no quantity, D13). The AQL LIMITS
 * are the Owner's (D6): for anyone else the view has no `limits` key and this card shows the verdict
 * and the sample only.
 *
 * Cells are 44px squares — this grid is tapped on a tablet at the bench as well as read on a laptop.
 */

const CELL: Record<SlotState, string> = {
  pass: 'bg-green-100 text-green-900',
  fail: 'border-2 border-red-600 bg-red-100 text-red-800',
  makeready: 'border border-slate-300 bg-slate-200 text-slate-600',
  // Dashed = nothing recorded (an absence of data), distinct from grey = a recorded make-ready.
  never: 'border-2 border-dashed border-slate-400 bg-transparent text-slate-400',
  upcoming: 'border border-slate-200 bg-slate-50 text-slate-300',
  // The line was not on a machine this hour: nothing was due, so nothing is drawn as missing.
  off: 'bg-transparent text-slate-300',
};

const GLYPH: Record<SlotState, string> = { pass: '✓', fail: '✕', makeready: 'N/A', never: '', upcoming: '', off: '·' };

export function QcGridDesktop({ view, denied = false }: { view: QcGridView | null; denied?: boolean }) {
  const t = useT();
  const { locale } = useMisLocale();
  if (denied) {
    return <p role="alert" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">{t('d9.noAccess')}</p>;
  }
  if (!view) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{t('d9.loadFailed')}</p>
        <Link href="/mis/qc" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">
          {t('d9.openChecks')}
        </Link>
      </div>
    );
  }

  const { grid, shift, dateKey, status } = view;
  const stateLabel = (s: SlotState) => t(`d9.legend.${s}` as never);
  const dayLabel = dateKey
    ? new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${dateKey}T00:00:00Z`))
    : '';

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
        <span>{t('d9.crumb.quality')}</span>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-slate-900">{t('d9.crumb.checks')}</span>
      </nav>

      <DesktopPageHeader
        title={t('d9.title')}
        summary={
          shift && grid && dateKey
            ? `${dayLabel} · ${shift.name}, ${shift.startTime}–${shift.endTime} · ${grid.totals.lines} ${t('d9.lines')} · ${grid.totals.taken} ${t('d9.of')} ${grid.totals.slots} ${t('d9.checksTaken')}`
            : undefined
        }
        secondary={
          <>
            <Link href="/mis/qc/defects" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t('d9.defects')}
            </Link>
            {view.shifts.length > 0 ? (
            // A plain GET form: no script decides which shift or day is shown.
            <form method="get" action="/mis/qc/grid" className="flex items-center gap-2">
              <label className="sr-only" htmlFor="d9-shift">{t('d9.shift')}</label>
              <select id="d9-shift" name="shift" defaultValue={shift?.id ?? ''} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
                {view.shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.startTime}–{s.endTime}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="d9-date">{t('d9.date')}</label>
              <input id="d9-date" type="date" name="date" defaultValue={dateKey ?? undefined} max={view.todayKey} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800" />
              <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('d9.apply')}
              </button>
            </form>
          ) : null}
          </>
        }
        primary={
          view.canWrite ? (
            <Link href="/mis/qc/grid?view=capture" className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">
              {t('d9.recordCheck')}
            </Link>
          ) : undefined
        }
      />

      {status ? (
        <p className="-mt-2 mb-4">
          <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', status === 'running' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-300 bg-[#f1ebdf] text-slate-700')}>
            {t(`d9.status.${status}` as never)}
          </span>
        </p>
      ) : null}

      {!shift || !grid ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">{t('d9.noShift')}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">{grid.columns.length} {t('d9.hours')}, {grid.totals.lines} {t('d9.linesShift')}</h2>
              <span className="text-xs text-slate-500">{t('d9.gridHint')}</span>
            </header>

            {grid.rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{t('d9.noLines')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-1 text-xs" aria-label={t('d9.title')}>
                  <thead>
                    <tr>
                      <th scope="col" className="min-w-40 py-1 pr-3 text-left text-sm font-medium text-slate-800">{t('d9.line')}</th>
                      {grid.columns.map((c) => (
                        <th key={c.index} scope="col" className="min-w-11 text-center font-mono text-[11px] font-bold text-slate-700">
                          {c.label.slice(0, 2)}<span className="font-normal text-slate-400">:{c.label.slice(3)}</span>
                        </th>
                      ))}
                      <th scope="col" className="px-2 text-center font-mono text-[10px] font-medium text-slate-500">{t('d9.taken')}</th>
                      <th scope="col" className="px-2 text-center font-mono text-[10px] font-medium text-slate-500">{t('d9.failed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grid.rows.map((row) => (
                      <tr key={row.orderId}>
                        <th scope="row" className="pr-3 text-left font-normal">
                          <span className="block text-sm font-semibold text-slate-900">{row.machines.length > 0 ? row.machines.join(', ') : row.orderNumber}</span>
                          <span className="block font-mono text-[10px] text-slate-500">{row.machines.length > 0 ? `${row.orderNumber} · ` : ''}{row.description ?? '—'}</span>
                        </th>
                        {row.cells.map((cell, i) => (
                          <td key={i} className="p-0">
                            <Link
                              href={`/mis/qc/${row.orderId}`}
                              aria-label={`${row.orderNumber}, ${grid.columns[i].label}: ${stateLabel(cell.state)}`}
                              className={cn('flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sm font-bold', CELL[cell.state])}
                            >
                              {GLYPH[cell.state]}
                            </Link>
                          </td>
                        ))}
                        <td className="px-2 text-center font-mono text-sm font-semibold text-slate-900">{row.taken}</td>
                        <td className="px-2 text-center">
                          {row.failed > 0 ? <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-sm font-bold text-red-800">{row.failed}</span> : <span className="text-slate-400">–</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" className="pt-3 text-left text-sm font-semibold text-slate-900">{grid.totals.lines} {t('d9.lines')} · {shift.name}</th>
                      <td colSpan={grid.columns.length} />
                      <td className="px-2 pt-3 text-center font-mono text-base font-bold text-slate-900">{grid.totals.taken}</td>
                      <td className="px-2 pt-3 text-center">
                        {grid.totals.fail > 0 ? <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-base font-bold text-red-800">{grid.totals.fail}</span> : <span className="text-slate-400">–</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-slate-200 pt-3 text-xs text-slate-600" aria-label={t('d9.legendLabel')}>
              {(['pass', 'fail', 'makeready', 'never', ...(grid.totals.upcoming > 0 ? (['upcoming'] as const) : []), ...(grid.totals.off > 0 ? (['off'] as const) : [])] as SlotState[]).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn('inline-flex size-5 items-center justify-center rounded text-[8px] font-bold', CELL[s])}>{GLYPH[s] === 'N/A' ? '' : GLYPH[s]}</span>
                  {stateLabel(s)}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-mono text-[11px] text-slate-500">
              {grid.totals.slots} {t('d9.slots')} = {grid.totals.lines} {t('d9.lines')} × {grid.totals.columns} {t('d9.hours')} · {grid.totals.pass} {t('d9.passed')} + {grid.totals.fail} {t('d9.failedWord')} + {grid.totals.makeready} {t('d9.makeready')} + {grid.totals.never} {t('d9.notTaken')}
              {grid.totals.upcoming > 0 ? ` + ${grid.totals.upcoming} ${t('d9.upcoming')}` : ''}
              {grid.totals.off > 0 ? ` + ${grid.totals.off} ${t('d9.off')}` : ''}
            </p>
            {!grid.identityHolds ? (
              <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">{t('d9.identityBroken')}</p>
            ) : null}
          </section>

          <div className="flex min-w-0 flex-col gap-5">
            <section className="rounded-2xl bg-[#171310] p-5 text-white">
              <header className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold">{view.aql ? `${t('d9.aqlTitle')} · ${view.aql.orderNumber}` : t('d9.aqlTitle')}</h2>
                {view.aql ? (
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', view.aql.decision === 'ACCEPT' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200')}>
                    {view.aql.decision === 'ACCEPT' ? t('d9.accepted') : t('d9.rejected')}
                  </span>
                ) : null}
              </header>
              {view.aql ? (
                <>
                  <p className="font-mono text-xs text-slate-300">
                    {t('d9.sample')} {view.aql.sampleSize ?? '—'}
                    {view.aql.limits && view.aql.limits.sampleSizeRequired !== null ? ` / ${view.aql.limits.sampleSizeRequired} ${t('d9.requiredSample')}` : ''} · {view.aql.timeLabel}
                    {view.aql.limits?.sampleSizeMet === false ? ` · ${t('d9.belowRequired')}` : ''}
                  </p>
                  {view.aql.limits ? (
                    <ul className="mt-4 flex flex-col gap-3 border-t border-white/15 pt-4">
                      {view.aql.limits.breakdown.map((line) => (
                        <li key={line.severity}>
                          <p className="flex items-baseline justify-between font-mono text-sm">
                            <span>
                              <span className={cn('text-xl font-bold', line.exceeded && 'text-red-300')}>{line.found}</span>
                              <span className="text-slate-400"> {t('d9.foundOf')} {line.max} {t('d9.allowed')}</span>
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400">{t(`d9.severity.${line.severity}` as never)}</span>
                          </p>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/15" role="img" aria-label={`${line.found} / ${line.max}`}>
                            <span className={cn('block h-full rounded-full', line.exceeded ? 'bg-red-400' : 'bg-green-400')} style={{ width: `${line.max > 0 ? Math.min(100, (line.found / line.max) * 100) : line.found > 0 ? 100 : 0}%` }} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-4 font-mono text-[11px] text-slate-400">{view.aql.limits ? t('d9.limitsSnapshot') : t('d9.limitsOwnerOnly')}</p>
                </>
              ) : (
                <p className="text-sm text-slate-300">{t('d9.noAql')}</p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <header className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">{t('d9.failuresTitle')}</h2>
                <span className="text-xs text-slate-500">{grid.failures.length}</span>
              </header>
              {grid.failures.length === 0 ? (
                <p className="text-sm text-slate-500">{t('d9.noFailures')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {grid.failures.map((f) => (
                    <li key={f.checkId} className="border-l-4 border-red-600 pl-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {f.parameter} · {f.timeLabel} · {f.machines.length > 0 ? f.machines.join(', ') : f.orderNumber}
                      </p>
                      <p className="text-sm text-slate-600">
                        {[f.notes, f.defectType, f.defectQty !== null ? String(f.defectQty) : null, f.machines.length > 0 ? f.orderNumber : null].filter(Boolean).join(' · ')}
                      </p>
                      <p className={cn('text-xs font-semibold', f.cleared ? 'text-green-800' : 'text-red-700')}>
                        {f.cleared ? `${t('d9.cleared')} ${f.cleared}` : t('d9.open')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {grid.missed.length > 0 ? (
                <div className="mt-4 border-t border-slate-200 pt-3">
                  <p className="text-sm font-semibold text-slate-900">{t('d9.missedTitle')} · {grid.missed.length}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-700">
                    {grid.missed.slice(0, 6).map((m) => (
                      <li key={`${m.orderId}-${m.slotLabel}`} className="font-mono text-xs">
                        {m.slotLabel} · {m.machines.length > 0 ? m.machines.join(', ') : m.orderNumber}{m.machines.length > 0 ? ` · ${m.orderNumber}` : ''}
                      </li>
                    ))}
                  </ul>
                  {grid.missed.length > 6 ? <p className="mt-1 text-xs text-slate-500">+{grid.missed.length - 6} {t('d9.moreMissed')}</p> : null}
                  <p className="mt-2 font-mono text-[11px] text-slate-500">{t('d9.missedNote')}</p>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
