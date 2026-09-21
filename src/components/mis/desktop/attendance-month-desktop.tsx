'use client';

import Link from 'next/link';

import {
  durationLabel,
  hoursLabel,
  type AttendanceMonthView,
  type CellState,
  type DayDetail,
} from '@/lib/mis/attendance-month';
import { cn } from '@/lib/utils';

import { useMisLocale, useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';

/**
 * D8 — "Payroll is arithmetic somebody has to be able to check."
 *
 * Every number on this screen is a tally of the cells you can see: the row totals are tallies of
 * the row, the footer is the sum of the rows, and `identityHolds` says so out loud (and the screen
 * says so if it ever does not). Nothing here counts, buckets or does arithmetic on a date — the view
 * arrives already built by `getAttendanceMonthView`, in the factory's calendar (D22).
 *
 * What the artboard shows that nothing records is left out and SAID: a "weekly off" state and "26
 * working days" (no weekly-off or working-day rule exists, so every calendar day is a slot and none
 * is marked as a day off), and the "hourly rate" line (pay is not attendance; D26 also replaced its
 * formula). Overtime is shown as RECORDED, next to what the two punches imply, because the two are
 * entered separately (D20) and a screen that showed only one could hide a disagreement.
 *
 * Selection is in the URL (`?emp=&day=`), so a cell is a link: no script decides what is shown.
 */

const href = (q: { month: string; dept?: string | null; emp?: string | null; day?: string | null }) => {
  const p = new URLSearchParams();
  p.set('month', q.month);
  if (q.dept) p.set('dept', q.dept);
  if (q.emp) p.set('emp', q.emp);
  if (q.day) p.set('day', q.day);
  return `/mis/attendance?${p.toString()}`;
};

const STATE_STYLE: Record<CellState, string> = {
  PRESENT: 'bg-green-100 text-green-900',
  PRESENT_OT: 'border-b-4 border-indigo-700 bg-green-100 text-green-900',
  HALF: 'border border-green-400 bg-green-50 text-green-900',
  ABSENT: 'bg-red-100 font-bold text-red-800',
  LEAVE: 'bg-violet-100 font-bold text-violet-900',
  // Dashed = never recorded (MIS_UI_SPEC §4.4 rule 6): an absence of data, not a recorded state.
  NONE: 'border border-dashed border-slate-400 bg-transparent text-slate-400',
  OTHER: 'bg-amber-100 font-bold text-amber-900',
};

const GLYPH: Record<CellState, string> = { PRESENT: '', PRESENT_OT: '', HALF: '½', ABSENT: 'A', LEAVE: 'L', NONE: '', OTHER: '?' };

export function AttendanceMonthDesktop({ view }: { view: AttendanceMonthView | null }) {
  const t = useT();
  const { locale } = useMisLocale();
  if (!view) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{t('d8.loadFailed')}</p>
        <Link href="/mis/attendance?view=classic" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">
          {t('d8.dayRegister')}
        </Link>
      </div>
    );
  }
  const intl = locale === 'hi' ? 'hi-IN' : 'en-IN';
  const monthName = (key: string, style: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat(intl, { month: style, year: style === 'long' ? 'numeric' : undefined, timeZone: 'UTC' }).format(
      new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)),
    );
  const dayHeading = (key: string) =>
    new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));

  const { totals } = view;
  const showHalf = totals.half > 0;
  const showOther = totals.other > 0;
  const stateLabel = (s: CellState) => t(({ PRESENT: 'd8.legend.present', PRESENT_OT: 'd8.legend.presentOt', HALF: 'd8.legend.half', ABSENT: 'd8.legend.absent', LEAVE: 'd8.legend.leave', NONE: 'd8.legend.none', OTHER: 'd8.legend.other' } as const)[s]);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
        <span>{t('d8.crumb.people')}</span>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-slate-900">{t('d8.crumb.attendance')}</span>
      </nav>

      <DesktopPageHeader
        title={monthName(view.monthKey)}
        summary={`${view.running ? t('d8.runningMonth') : t('d8.closedMonth')} · ${view.days.length} ${t('d8.days')} · ${view.departmentName ?? t('d8.allDepartments')}, ${totals.workers} ${t('d8.workers')}`}
        secondary={
          <>
            <nav aria-label={t('d8.monthNav')} className="flex items-center gap-2">
              <Link
                href={href({ month: view.prevKey, dept: view.departmentId })}
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ‹ {monthName(view.prevKey, 'short')}
              </Link>
              {view.nextKey ? (
                <Link
                  href={href({ month: view.nextKey, dept: view.departmentId })}
                  className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {monthName(view.nextKey, 'short')}{view.nextKey === view.currentKey ? ` (${t('d8.running')})` : ''} ›
                </Link>
              ) : null}
            </nav>
            <Link
              href="/mis/attendance?view=classic"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('d8.dayRegister')}
            </Link>
            {/* A plain GET form: no script decides which department is shown. */}
            <form method="get" action="/mis/attendance" className="flex items-center gap-2">
              <input type="hidden" name="month" value={view.monthKey} />
              <label className="sr-only" htmlFor="d8-dept">{t('d8.department')}</label>
              <select
                id="d8-dept"
                name="dept"
                defaultValue={view.departmentId ?? ''}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                <option value="">{t('d8.allDepartments')}</option>
                {view.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('d8.apply')}
              </button>
            </form>
          </>
        }
        primary={
          // A flag from the server, never a figure: the payroll screen decides what the Owner sees there.
          view.canPayroll ? (
            <Link href="/mis/payroll" className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">
              {t('d8.openPayroll')}
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">{t('d8.gridTitle')}</h2>
            <span className="text-xs text-slate-500">{t('d8.gridHint')}</span>
          </header>

          {view.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{t('d8.noPeople')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs" aria-label={t('d8.gridTitle')}>
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 min-w-40 bg-white py-1 pr-3 text-left text-sm font-medium text-slate-800">{t('d8.employee')}</th>
                    {view.days.map((d) => (
                      <th key={d.key} scope="col" className="px-0.5 pb-1 text-center font-mono font-normal text-slate-500">
                        <span className="block">{d.day}</span>
                        <span className="block text-[9px] text-slate-400">{d.weekday}</span>
                      </th>
                    ))}
                    <TotalHead label={t('d8.col.p')} title={t('d8.legend.present')} />
                    {showHalf ? <TotalHead label={t('d8.col.h')} title={t('d8.legend.half')} /> : null}
                    <TotalHead label={t('d8.col.a')} title={t('d8.legend.absent')} />
                    <TotalHead label={t('d8.col.l')} title={t('d8.legend.leave')} />
                    <TotalHead label={t('d8.col.nr')} title={t('d8.legend.none')} />
                    <TotalHead label={t('d8.col.ot')} title={t('d8.overtime')} />
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row" className="sticky left-0 z-10 bg-white py-0.5 pr-3 text-left font-normal">
                        <Link
                          href={href({ month: view.monthKey, dept: view.departmentId, emp: row.id })}
                          aria-current={row.id === view.selected?.id ? 'true' : undefined}
                          className="inline-flex min-h-11 flex-col justify-center"
                        >
                          <span className={cn('text-sm font-semibold text-slate-900', row.id === view.selected?.id && 'underline decoration-indigo-600 decoration-2 underline-offset-4')}>{row.name}</span>
                          <span className="font-mono text-[10px] text-slate-500">{row.code}{row.department ? ` · ${row.department}` : ''}</span>
                        </Link>
                      </th>
                      {row.cells.map((state, i) => {
                        const day = view.days[i];
                        const chosen = row.id === view.selected?.id && day.key === view.selected?.dayKey;
                        return (
                          <td key={day.key} className="p-0.5">
                            <Link
                              href={href({ month: view.monthKey, dept: view.departmentId, emp: row.id, day: day.key })}
                              aria-label={`${row.name}, ${day.day} ${monthName(view.monthKey, 'short')}: ${stateLabel(state)}`}
                              aria-current={chosen ? 'true' : undefined}
                              className={cn('flex min-h-11 min-w-8 items-center justify-center rounded-md text-[11px]', STATE_STYLE[state], chosen && 'ring-2 ring-indigo-600 ring-offset-1')}
                            >
                              {GLYPH[state]}
                            </Link>
                          </td>
                        );
                      })}
                      <Total value={row.counts.present} />
                      {showHalf ? <Total value={row.counts.half} /> : null}
                      <Total value={row.counts.absent} tone="red" />
                      <Total value={row.counts.leave} />
                      <Total value={row.counts.none} />
                      <Total value={hoursLabel(row.counts.otMinutes)} />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300">
                    <th scope="row" colSpan={view.days.length + 1} className="py-3 text-left text-sm font-semibold text-slate-900">
                      {totals.workers} {t('d8.poolTotal')} · {view.departmentName ?? t('d8.allDepartments')}
                    </th>
                    <Total value={totals.present} strong />
                    {showHalf ? <Total value={totals.half} strong /> : null}
                    <Total value={totals.absent} tone="red" strong />
                    <Total value={totals.leave} strong />
                    <Total value={totals.none} strong />
                    <Total value={hoursLabel(totals.otMinutes)} strong />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-slate-200 pt-3 text-xs text-slate-600" aria-label={t('d8.legendLabel')}>
            {(['PRESENT', 'PRESENT_OT', 'HALF', 'ABSENT', 'LEAVE', 'NONE', 'OTHER'] as const)
              .filter((s) => (s !== 'HALF' || showHalf) && (s !== 'OTHER' || showOther))
              .map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn('inline-flex size-4 items-center justify-center rounded-sm text-[9px]', STATE_STYLE[s])}>{GLYPH[s]}</span>
                  {stateLabel(s)}
                </li>
              ))}
          </ul>
          <p className="mt-2 font-mono text-[11px] text-slate-500">
            {totals.slots} {t('d8.slots')} = {totals.workers} {t('d8.workers')} × {totals.days} {t('d8.days')} · {totals.present} {t('d8.present')}
            {showHalf ? ` + ${totals.half} ${t('d8.half')}` : ''} + {totals.absent} {t('d8.absent')} + {totals.leave} {t('d8.leave')} + {totals.none} {t('d8.notRecorded')}
            {showOther ? ` + ${totals.other} ${t('d8.other')}` : ''}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-500">{t('d8.legend.nrNote')}</p>
          <p className="mt-1 font-mono text-[11px] text-slate-500">{t('d8.noWeeklyOff')}</p>
          {!view.identityHolds ? (
            <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">{t('d8.identityBroken')}</p>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          {view.selected ? (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-live="polite">
                <header className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900">{view.selected.name}</h2>
                  <span className="font-mono text-xs text-slate-500">{view.selected.code}</span>
                </header>
                {view.selected.dayKey ? (
                  <DayPanel
                    heading={dayHeading(view.selected.dayKey)}
                    state={view.selected.dayState}
                    day={view.selected.day}
                  />
                ) : (
                  <p className="text-sm text-slate-500">{t('d8.selectDay')}</p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <header className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900">{t('d8.monthTotal')}</h2>
                  <span className="text-xs text-slate-500">{view.selected.name}</span>
                </header>
                <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                  <Row label={t('d8.presentOf')} value={`${view.selected.month.present} ${t('d8.of')} ${view.selected.month.days}`} bold />
                  {view.selected.month.half > 0 ? <Row label={t('d8.legend.half')} value={String(view.selected.month.half)} /> : null}
                  <Row label={t('d8.legend.absent')} value={String(view.selected.month.absent)} danger={view.selected.month.absent > 0} />
                  <Row label={t('d8.legend.leave')} value={String(view.selected.month.leave)} />
                  <Row label={t('d8.legend.none')} value={String(view.selected.month.none)} />
                  <Row label={t('d8.overtime')} value={`${hoursLabel(view.selected.month.otMinutes)} h`} bold />
                </dl>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DayPanel({ heading, state, day }: { heading: string; state: CellState | null; day: DayDetail | null }) {
  const t = useT();
  return (
    <div>
      <p className="mb-3 font-mono text-xs text-slate-500">{heading}</p>
      {!day ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600">
          {state === 'LEAVE' ? t('d8.leaveNoRow') : t('d8.notRecordedDay')}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <Row label={t('d8.status')} value={t(`d8.status.${day.status}` as never) === `d8.status.${day.status}` ? day.status : t(`d8.status.${day.status}` as never)} bold />
            <Row label={t('d8.in')} value={day.inLabel ?? '—'} mono />
            <Row label={t('d8.out')} value={day.outLabel ?? '—'} mono />
            <Row label={t('d8.hoursWorked')} value={day.workedMinutes !== null ? durationLabel(day.workedMinutes) : '—'} mono />
            <Row label={t('d8.shiftLength')} value={day.shiftMinutes !== null && day.shiftLabel ? `${day.shiftName} · ${day.shiftLabel} · ${durationLabel(day.shiftMinutes)}` : '—'} />
            <Row label={t('d8.recordedOt')} value={durationLabel(day.recordedOtMinutes)} mono accent />
            {day.lateMinutes > 0 ? <Row label={t('d8.late')} value={durationLabel(day.lateMinutes)} mono /> : null}
          </dl>
          <div className="mt-4 rounded-xl border border-[#e7dfd0] bg-[#f1ebdf] px-4 py-3">
            <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-700">{t('d8.working')}</p>
            <Working day={day} />
          </div>
        </>
      )}
    </div>
  );
}

function Working({ day }: { day: DayDetail }) {
  const t = useT();
  if (day.workedMinutes === null || day.inLabel === null || day.outLabel === null) {
    return <p className="text-sm text-slate-700">{t('d8.noOut')}</p>;
  }
  const worked = durationLabel(day.workedMinutes);
  return (
    <div className="flex flex-col gap-1.5 text-sm text-slate-800">
      <p className="font-mono">{day.outLabel} − {day.inLabel} = {worked}</p>
      {day.shiftMinutes === null || day.impliedOtMinutes === null ? (
        <p>{t('d8.noShift')}</p>
      ) : (
        <>
          <p className="font-mono">{day.shiftName}: {day.shiftLabel} = {durationLabel(day.shiftMinutes)}</p>
          <p className="font-mono">{worked} − {durationLabel(day.shiftMinutes)} = {durationLabel(day.impliedOtMinutes)}</p>
          <p className={cn('font-medium', day.otAgrees === false && 'text-red-800')} role={day.otAgrees === false ? 'alert' : undefined}>
            {t('d8.implies')} {durationLabel(day.impliedOtMinutes)}. {day.otAgrees ? t('d8.otAgrees') : t('d8.otDiffers')}
          </p>
        </>
      )}
    </div>
  );
}

function TotalHead({ label, title }: { label: string; title: string }) {
  return (
    <th scope="col" title={title} className="px-2 pb-1 text-center font-mono text-[10px] font-medium text-slate-500">
      {label}
    </th>
  );
}

function Total({ value, tone, strong }: { value: number | string; tone?: 'red'; strong?: boolean }) {
  const zero = value === 0 || value === '0.0';
  return (
    <td className={cn('px-2 text-center font-mono text-sm', strong ? 'font-bold' : 'font-semibold', tone === 'red' && !zero ? 'text-red-800' : 'text-slate-900')}>
      {zero ? '–' : value}
    </td>
  );
}

function Row({ label, value, mono, bold, danger, accent }: { label: string; value: string; mono?: boolean; bold?: boolean; danger?: boolean; accent?: boolean }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('text-slate-900', mono && 'font-mono', bold && 'font-semibold', danger && 'text-red-800', accent && 'text-indigo-700')}>{value}</dd>
    </>
  );
}
