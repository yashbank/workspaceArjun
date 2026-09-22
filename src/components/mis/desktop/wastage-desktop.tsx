'use client';

import Link from 'next/link';

import { axisTicks, axisTop, barGeometry, compactTick, seriesHue } from '@/lib/mis/chart';
import { WEEK_CHOICES, type WastageReport } from '@/lib/mis/wastage';
import { cn } from '@/lib/utils';

import { useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';

/**
 * D7 — "A number nobody can open is a number nobody believes."
 *
 * Every figure here is drawn from the one `WastageReport` the server built; the CSV export is that
 * same report laid out as rows, so the sheet and the screen cannot disagree.
 *
 * What the artboard shows that nothing records — an "ink change" event marker, the "down 22% since"
 * headline, an allowance line and "vs allowed" — is left out and SAID: there is no wastage allowance
 * and no event log, so there is no breach colour and no target line to draw. Only two labels are
 * printed on the chart (first week and last week); every other value is read off the axis.
 * Machine utilisation is not a report yet, so its tab is absent rather than dead.
 */

const num = (n: number, digits = 1) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n);
const dmy = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
const dmyFull = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
const unitLabel = (unit: string) => unit.charAt(0).toUpperCase() + unit.slice(1).toLowerCase();

const W = 900;
const H = 240;
const PAD = { left: 40, right: 8, top: 22, bottom: 24 };

type Query = { weeks: number; machine: string | null; unit: string | null };

const href = (base: string, q: Query, over: Partial<Query> = {}) => {
  const merged = { ...q, ...over };
  const params = new URLSearchParams();
  params.set('weeks', String(merged.weeks));
  if (merged.machine) params.set('machine', merged.machine);
  if (merged.unit) params.set('unit', merged.unit);
  return `${base}?${params.toString()}`;
};

export function WastageDesktop({ report }: { report: WastageReport | null }) {
  const t = useT();
  if (!report) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {t('d7.loadFailed')}
      </p>
    );
  }
  const unit = report.unit;
  const u = unit ? unitLabel(unit) : '';
  const q: Query = { weeks: report.range.weeks, machine: report.machineId, unit };
  const { totals } = report;
  const hasWaste = totals.waste > 0;

  const seriesName = (s: { name: string | null }) => s.name ?? t('d7.otherPhase');

  return (
    <div>
      <DesktopPageHeader
        title={t('d7.title')}
        summary={
          unit
            ? `${dmyFull(report.range.fromKey)} – ${dmyFull(report.range.toKey)} · ${report.range.weeks} ${t('d7.weeks')} · ${num(totals.waste)} ${u} ${t('d7.total')}${
                totals.percent !== null ? ` · ${num(totals.percent)}% ${t('d7.ofOutput')}` : ''
              }`
            : `${dmyFull(report.range.fromKey)} – ${dmyFull(report.range.toKey)} · ${report.range.weeks} ${t('d7.weeks')}`
        }
        secondary={
          <>
            <nav aria-label={t('d7.rangeLabel')} className="flex overflow-hidden rounded-lg border border-slate-300 bg-white">
              {WEEK_CHOICES.map((weeks) => (
                <Link
                  key={weeks}
                  href={href('/mis/reports', q, { weeks })}
                  aria-current={weeks === report.range.weeks ? 'true' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center px-3 text-sm font-medium',
                    weeks === report.range.weeks ? 'bg-[#171310] text-white' : 'text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {weeks}
                </Link>
              ))}
              <span className="inline-flex items-center border-l border-slate-200 px-3 text-xs text-slate-500">{t('d7.weeks')}</span>
            </nav>
            {/* A plain GET form: no script decides which machine is shown. */}
            <form method="get" action="/mis/reports" className="flex items-center gap-2">
              <input type="hidden" name="weeks" value={report.range.weeks} />
              {unit ? <input type="hidden" name="unit" value={unit} /> : null}
              <label className="sr-only" htmlFor="d7-machine">{t('d7.machine')}</label>
              <select
                id="d7-machine"
                name="machine"
                defaultValue={report.machineId ?? ''}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800"
              >
                <option value="">{t('d7.allMachines')}</option>
                {report.machines.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('d7.apply')}
              </button>
            </form>
          </>
        }
        primary={
          <a
            href={href('/api/mis/reports/wastage', q)}
            className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t('d7.exportCsv')}
          </a>
        }
      />

      <nav aria-label={t('d7.tabsLabel')} className="-mt-2 mb-5 flex gap-1 border-b border-slate-200">
        {(['production', 'wastage', 'quality', 'attendance'] as const).map((tab) => {
          const current = tab === 'wastage';
          return (
            <Link
              key={tab}
              // The other reports live on the existing screen; the tab strip reaches it rather than drawing dead tabs.
              href={current ? href('/mis/reports', q) : '/mis/reports?view=classic'}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold',
                current ? 'border-indigo-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {t(`d7.tab.${tab}` as never)}
            </Link>
          );
        })}
      </nav>

      {report.units.length > 1 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span>{t('d7.mixedUnits')}</span>
          <span className="flex gap-1.5" role="group" aria-label={t('d7.unit')}>
            {report.units.map((x) => (
              <Link
                key={x.unit}
                href={href('/mis/reports', q, { unit: x.unit })}
                aria-current={x.unit === unit ? 'true' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-lg border px-3 font-semibold',
                  x.unit === unit ? 'border-amber-900 bg-amber-900 text-white' : 'border-amber-300 bg-white text-amber-900',
                )}
              >
                {unitLabel(x.unit)}
              </Link>
            ))}
          </span>
        </div>
      ) : null}

      <Card>
        <CardTitle right={unit ? `${u} · ${report.range.weeks} ${t('d7.weeks')}` : t('d7.chartNote')}>{t('d7.chartTitle')}</CardTitle>
        {hasWaste ? (
          <>
            <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
              {report.series.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: s.hue }} />
                  {seriesName(s)}
                </li>
              ))}
            </ul>
            <StackedChart report={report} unit={u} />
            <p className="mt-2 font-mono text-[11px] text-slate-500">{t('d7.noEvents')}</p>
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">{t('d7.noData')}</p>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card>
          <CardTitle right={t('d7.machineNote')}>{t('d7.machineTitle')}</CardTitle>
          {report.byMachine.length === 0 ? (
            <p className="text-sm text-slate-500">{t('d7.noMachines')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(() => {
                const max = Math.max(...report.byMachine.map((m) => m.waste), 0);
                return report.byMachine.map((m) => (
                  <li key={m.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate text-slate-800">{m.name}</span>
                    <span className="h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${m.name}: ${num(m.waste)} ${u}`}>
                      <span className="block h-full rounded-full" style={{ width: `${max > 0 ? (m.waste / max) * 100 : 0}%`, backgroundColor: seriesHue(0) }} />
                    </span>
                    <span className="font-mono text-xs text-slate-700">
                      {num(m.waste)} {u}
                      <span className="text-slate-500"> · {m.percent === null ? '—' : `${num(m.percent)}%`}</span>
                    </span>
                  </li>
                ));
              })()}
            </ul>
          )}
          <p className="mt-4 font-mono text-[11px] text-slate-500">{t('d7.noAllowance')}</p>
        </Card>

        <Card>
          <CardTitle right={t('d7.ordersNote')}>{t('d7.ordersTitle')}</CardTitle>
          {report.topOrders.length === 0 ? (
            <p className="text-sm text-slate-500">{t('d7.noOrders')}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="py-2 font-medium">{t('d7.col.order')}</th>
                  <th scope="col" className="py-2 font-medium">{t('d7.col.item')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('d7.col.wastage')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('d7.col.percent')}</th>
                </tr>
              </thead>
              <tbody>
                {report.topOrders.map((o) => (
                  <tr key={o.orderId} className="border-b border-slate-100">
                    <th scope="row" className="py-2 text-left font-mono font-medium">
                      <Link href={`/mis/orders/${o.orderId}`} className="inline-flex min-h-11 items-center text-indigo-700 hover:underline">{o.orderNumber}</Link>
                    </th>
                    <td className="py-2 text-slate-800">{o.description ?? '—'}</td>
                    <td className="py-2 text-right font-mono">{num(o.waste)} {u}</td>
                    <td className="py-2 text-right font-mono">{o.percent === null ? '—' : `${num(o.percent)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-200 pt-3">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
              {t('d7.totalAll')} {totals.orders} {t('d7.orders')}
            </span>
            <span>
              <span className="font-mono text-xl font-bold text-slate-900">{num(totals.waste)} {u}</span>
              <span className="ml-2 font-mono text-xs text-slate-500">
                {totals.percent === null
                  ? t('d7.noOutput')
                  : `${num(totals.percent)}% ${t('d7.outputDenominator')} ${num(totals.produced, 0)} ${u}`}
              </span>
            </span>
          </div>
          {report.topOrders.length > 0 ? (
            <a href={href('/api/mis/reports/wastage', q) + '&part=orders'} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 hover:underline">
              {t('d7.exportOrders')}
            </a>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

/**
 * One scale, one axis, four named series: each week's bar is its phases stacked in a fixed order.
 * Only the first and last week's TOTAL is printed — "a figure printed on all forty segments is a
 * wall of digits that hides the shape it sits on". The same numbers are in the table for a screen reader.
 */
function StackedChart({ report, unit }: { report: WastageReport; unit: string }) {
  const t = useT();
  const totals = report.weeks.map((w) => w.total);
  const top = axisTop(totals);
  const ticks = axisTicks(top);
  const box = { width: W - PAD.left - PAD.right, height: H - PAD.top - PAD.bottom };
  const bars = barGeometry(totals, box, { top });
  const every = Math.max(1, Math.ceil(report.weeks.length / 13));
  const y = (v: number) => PAD.top + box.height - (v / top) * box.height;
  const last = report.weeks.length - 1;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${t('d7.chartTitle')}: ${unit}`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-500" style={{ fontSize: 10 }}>{compactTick(tick)}</text>
          </g>
        ))}
        {report.weeks.map((week, i) => {
          const bar = bars[i];
          if (!bar) return null;
          let cursor = 0;
          return (
            <g key={week.key}>
              {report.series.map((s) => {
                const value = week.byKey[s.key] ?? 0;
                if (value <= 0) return null;
                const from = cursor;
                cursor += value;
                const y1 = y(cursor);
                const y0 = y(from);
                return (
                  // A 2px surface-coloured stroke is the gap between segments: the boundary is empty space.
                  <rect key={s.key} x={PAD.left + bar.x} y={y1} width={bar.width} height={Math.max(0, y0 - y1)} fill={s.hue} className="stroke-white" strokeWidth={2} />
                );
              })}
              {(i === 0 || i === last) && week.total > 0 ? (
                <text x={PAD.left + bar.x + bar.width / 2} y={y(week.total) - 5} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 11, fontWeight: 600 }}>
                  {num(week.total)}
                </text>
              ) : null}
              {i % every === 0 || i === last ? (
                <text x={PAD.left + bar.x + bar.width / 2} y={H - 8} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>{dmy(week.startKey)}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{t('d7.chartTitle')} ({unit})</caption>
        <thead>
          <tr>
            <th scope="col">{t('d7.weekOf')}</th>
            {report.series.map((s) => (
              <th key={s.key} scope="col">{s.name ?? t('d7.otherPhase')}</th>
            ))}
            <th scope="col">{t('d7.total')}</th>
          </tr>
        </thead>
        <tbody>
          {report.weeks.map((w) => (
            <tr key={w.key}>
              <th scope="row">{dmyFull(w.startKey)}</th>
              {report.series.map((s) => (
                <td key={s.key}>{num(w.byKey[s.key] ?? 0)}</td>
              ))}
              <td>{num(w.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">{children}</section>;
}

function CardTitle({ children, right }: { children: React.ReactNode; right?: string }) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
      {right ? <span className="text-right text-xs text-slate-500">{right}</span> : null}
    </header>
  );
}
