'use client';

import Link from 'next/link';

import {
  SERIES_HUES,
  STATE_HUES,
  axisTicks,
  axisTop,
  barGeometry,
  compactTick,
  sparklinePath,
  valueToY,
} from '@/lib/mis/chart';
import type { TranslationKey } from '@/lib/mis/i18n';

import { useT } from '../shell/locale-provider';

/**
 * The fourteen widget bodies (D1).
 *
 * Every one takes data the page already fetched from the PHONE layer's server functions —
 * a widget never fetches, and there is no dashboard-only query. Every one also handles
 * "nothing recorded" as a first-class state: D2 is explicit that a widget with no data
 * "renders the honest empty state from 08 — 'no QC results recorded this month' — never a
 * zero, and never a blank rectangle that looks like a loading bug."
 *
 * Charts draw twice and let CSS choose: the full chart from 1024px up, the sparkline below
 * it. Same numbers, same order, one data path — the "charts degrade to sparklines" half of
 * the two-layout rule, without a JS breakpoint.
 */

export type DashboardData = {
  production: { produced: number; waste: number; machinesRun: number; entries: number } | null;
  series: { date: string; produced: number; waste: number }[];
  plan: number | null;
  machines: { free: number; running: number; down: number; total: number } | null;
  attendance: { headcount: number; present: number; late: number; onLeave: number; absent: number } | null;
  crew: { present: number; headcount: number; absent: number; onLeave: number; recorded: boolean } | null;
  approvals: { total: number; rows: { id: string; title: string; detail: string; age?: string }[] } | null;
  orders: { id: string; orderNumber: string; done: number; total: number; late: boolean; despatched: boolean }[];
  onTime: { pct: number; target: number; despatched: number; total: number } | null;
  wastageByPhase: { phase: string; kg: number }[];
  qc: { critical: number; major: number; minor: number; ceilings: { critical: number; major: number; minor: number } } | null;
  defectsOpen: number | null;
  /** Absent for every role but the Owner — the server never sends it (D24). */
  wages: { gross: number; ot: number; monthLabel: string; elapsedPct: number } | null;
};

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const num = (n: number) => new Intl.NumberFormat('en-IN').format(n);

/** The honest empty state (08): says what is missing, never a zero pretending to be data. */
function Empty({ messageKey }: { messageKey: TranslationKey }) {
  const t = useT();
  return (
    <p className="flex h-full min-h-16 items-center justify-center rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
      {t(messageKey)}
    </p>
  );
}

function Stat({ value, unit, note, chip }: { value: string; unit?: string; note?: string; chip?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <p className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-bold tracking-tight text-slate-900">{value}</span>
        {unit ? <span className="text-sm text-slate-500">{unit}</span> : null}
        {chip}
      </p>
      {note ? <p className="mt-auto pt-2 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

function Chip({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'flat'; children: React.ReactNode }) {
  const tones = {
    good: 'bg-green-50 text-green-800 border-green-200',
    warn: 'bg-amber-50 text-amber-900 border-amber-200',
    bad: 'bg-red-50 text-red-800 border-red-200',
    flat: 'bg-slate-100 text-slate-700 border-slate-200',
  } as const;
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

/** A sparkline: no axis, no labels, the same series the full chart draws. */
function Sparkline({ values, hue }: { values: number[]; hue: string }) {
  const d = sparklinePath(values, { width: 120, height: 28 });
  if (!d) return null;
  return (
    <svg viewBox="0 0 120 28" className="mt-1 h-7 w-full" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={hue} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The bodies
// ---------------------------------------------------------------------------

export function WidgetBody({ widgetKey, data }: { widgetKey: string; data: DashboardData }) {
  const t = useT();

  switch (widgetKey) {
    case 'output.yesterday': {
      if (!data.production || data.production.entries === 0) return <Empty messageKey="empty.noProduction" />;
      const series = data.series.map((d) => d.produced);
      return (
        <>
          <Stat value={num(data.production.produced)} unit="Nos" />
          <Sparkline values={series} hue={SERIES_HUES[0]} />
        </>
      );
    }

    case 'wastage.yesterday': {
      if (!data.production || data.production.entries === 0) return <Empty messageKey="empty.noProduction" />;
      return (
        <>
          <Stat value={num(data.production.waste)} unit="Kg" />
          <Sparkline values={data.series.map((d) => d.waste)} hue={SERIES_HUES[1]} />
        </>
      );
    }

    case 'machines.running': {
      if (!data.machines || data.machines.total === 0) return <Empty messageKey="empty.noMachines" />;
      const { running, free, down, total } = data.machines;
      return (
        <Stat
          value={`${running}/${total}`}
          chip={down > 0 ? <Chip tone="bad">{`${down} down`}</Chip> : <Chip tone="good">all up</Chip>}
          note={`${running} running · ${free} free · ${down} down`}
        />
      );
    }

    case 'orders.onTime': {
      if (!data.onTime || data.onTime.total === 0) return <Empty messageKey="empty.noOrders" />;
      const { pct, target, despatched, total } = data.onTime;
      return (
        <Stat
          value={`${pct}`}
          unit="%"
          chip={<Chip tone={pct >= target ? 'good' : 'warn'}>{`target ${target}%`}</Chip>}
          note={`${despatched} of ${total} orders · the marker is target`}
        />
      );
    }

    case 'output.againstPlan':
      return <OutputAgainstPlan data={data} />;

    case 'wastage.byPhase': {
      if (data.wastageByPhase.length === 0) return <Empty messageKey="empty.noWastage" />;
      const top = Math.max(...data.wastageByPhase.map((p) => p.kg), 1);
      const total = data.wastageByPhase.reduce((sum, p) => sum + p.kg, 0);
      const worst = data.wastageByPhase[0];
      return (
        <div className="flex h-full flex-col gap-1.5">
          {data.wastageByPhase.slice(0, 5).map((phase) => (
            <div key={phase.phase} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-xs text-slate-600">{phase.phase}</span>
              <span className="h-2.5 min-w-1 rounded-full" style={{ width: `${(phase.kg / top) * 100}%`, backgroundColor: SERIES_HUES[0] }} />
              <span className="font-mono text-[11px] text-slate-500">{num(phase.kg)}</span>
            </div>
          ))}
          {total > 0 ? (
            <p className="mt-auto pt-1 text-xs text-amber-900">
              {worst.phase} is {Math.round((worst.kg / total) * 100)}% of all waste
            </p>
          ) : null}
        </div>
      );
    }

    case 'machines.board': {
      if (!data.machines || data.machines.total === 0) return <Empty messageKey="empty.noMachines" />;
      const cells = [
        ...Array.from({ length: data.machines.running }, () => 'good' as const),
        ...Array.from({ length: data.machines.free }, () => 'free' as const),
        ...Array.from({ length: data.machines.down }, () => 'bad' as const),
      ];
      const fill = { good: STATE_HUES.good, free: STATE_HUES.warn, bad: STATE_HUES.bad };
      return (
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap gap-1.5">
            {cells.map((tone, i) => (
              <span key={i} className="h-6 w-14 rounded" style={{ backgroundColor: fill[tone] }} />
            ))}
          </div>
          <p className="mt-auto pt-2 text-xs text-slate-500">
            {data.machines.running} running · {data.machines.free} free · {data.machines.down} down
          </p>
        </div>
      );
    }

    case 'orders.inFlight': {
      if (data.orders.length === 0) return <Empty messageKey="empty.noOrders" />;
      return (
        <div className="flex h-full flex-col gap-2">
          {data.orders.slice(0, 5).map((order) => (
            <div key={order.id} className="flex items-center gap-2">
              <span className="w-20 shrink-0 font-mono text-[11px] text-slate-500">{order.orderNumber}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${order.total > 0 ? (order.done / order.total) * 100 : 0}%`,
                    backgroundColor: order.despatched ? STATE_HUES.good : SERIES_HUES[0],
                  }}
                />
              </span>
              <span className={`w-16 shrink-0 text-right font-mono text-[11px] ${order.late ? 'text-red-600' : 'text-slate-500'}`}>
                {order.despatched ? t('widget.orders.despatched') : `${order.done} of ${order.total}`}
              </span>
            </div>
          ))}
          <p className="mt-auto pt-1 text-xs text-slate-500">{t('widget.orders.phasesNote')}</p>
        </div>
      );
    }

    case 'orders.waitingOnYou': {
      if (!data.approvals || data.approvals.total === 0) return <Empty messageKey="empty.noApprovals" />;
      return (
        <div className="flex h-full flex-col gap-2">
          <p className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 font-mono text-sm font-bold text-white">
              {data.approvals.total}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-indigo-900">{t('widget.orders.waitingOnYou')}</span>
              {/* R1 / D1: the subtitle is what makes the count matter — "2" alone is a badge, this is a stake. */}
              <span className="block text-xs text-indigo-700">{t('widget.orders.waitingOnYou.nothingMoves')}</span>
            </span>
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {data.approvals.rows.slice(0, 3).map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2 py-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{row.title}</p>
                  <p className="truncate text-xs text-slate-500">{row.detail}</p>
                </div>
                {row.age && (
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                    {row.age}
                  </span>
                )}
              </div>
            ))}
          </div>
          <Link
            href="/mis/approvals"
            className="mt-auto flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 13 4 4L19 7" />
            </svg>
            {t('widget.orders.reviewApprovals')}
          </Link>
        </div>
      );
    }

    case 'qc.aqlThisMonth': {
      if (!data.qc) return <Empty messageKey="empty.noQc" />;
      const rows = [
        { label: t('qc.critical'), value: data.qc.critical, ceiling: data.qc.ceilings.critical },
        { label: t('qc.major'), value: data.qc.major, ceiling: data.qc.ceilings.major },
        { label: t('qc.minor'), value: data.qc.minor, ceiling: data.qc.ceilings.minor },
      ];
      return (
        <div className="flex h-full flex-col justify-center gap-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-600">{row.label}</span>
              <span className="font-mono text-slate-900">
                {row.value}
                <span className="text-slate-400"> / {row.ceiling}</span>
              </span>
              <Chip tone={row.value > row.ceiling ? 'bad' : 'good'}>{row.value > row.ceiling ? 'over' : 'within'}</Chip>
            </div>
          ))}
        </div>
      );
    }

    case 'qc.defectsOpen':
      if (data.defectsOpen === null) return <Empty messageKey="empty.noQc" />;
      return <Stat value={num(data.defectsOpen)} note={t('widget.qc.defectsOpen.about')} />;

    case 'people.attendanceToday': {
      if (!data.attendance || data.attendance.headcount === 0) return <Empty messageKey="empty.noAttendance" />;
      const a = data.attendance;
      return (
        <Stat
          value={`${a.present}/${a.headcount}`}
          chip={a.absent > 0 ? <Chip tone="warn">{`${a.absent} absent`}</Chip> : <Chip tone="good">all in</Chip>}
          note={`${a.late} late · ${a.onLeave} on leave · ${a.absent} absent`}
        />
      );
    }

    case 'people.crewToday': {
      if (!data.crew || !data.crew.recorded) return <Empty messageKey="empty.noAttendance" />;
      const c = data.crew;
      return <Stat value={`${c.present}/${c.headcount}`} note={`${c.absent} absent · ${c.onLeave} on leave`} />;
    }

    case 'money.wagesAccrued': {
      // Reached only when the server sent it. A non-owner never gets this widget in their
      // layout, so this branch cannot run for them (D24) — the guard is the absence of data,
      // not a hidden card.
      if (!data.wages) return <Empty messageKey="empty.noWages" />;
      return (
        <div className="flex h-full flex-col gap-2 text-slate-100">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400">
            <LockIcon />
            {t('desk.visibleToYouOnly')}
          </p>
          <p className="font-mono text-2xl font-bold text-white">{inr(data.wages.gross)}</p>
          <span className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <span className="block h-full rounded-full" style={{ width: `${data.wages.elapsedPct}%`, backgroundColor: STATE_HUES.good }} />
          </span>
          <p className="text-[11px] text-slate-400">
            {data.wages.elapsedPct}% of {data.wages.monthLabel} elapsed
          </p>
          <p className="mt-auto text-xs text-slate-300">
            {t('widget.money.overtime')} <span className="font-mono text-white">{inr(data.wages.ot)}</span>
          </p>
        </div>
      );
    }

    default:
      return <Empty messageKey="empty.noWidget" />;
  }
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * D1's centrepiece: output per day with the plan line.
 *
 * ONE SCALE, ONE AXIS. The plan shares the y-axis because it shares the unit (Nos). Wastage
 * is Kg and therefore a different chart — never a second line here, and never a second axis.
 */
function OutputAgainstPlan({ data }: { data: DashboardData }) {
  const t = useT();
  if (data.series.length === 0) return <Empty messageKey="empty.noProduction" />;

  const values = data.series.map((d) => d.produced);
  const plan = data.plan ?? undefined;
  const top = axisTop(values, plan);
  const ticks = axisTicks(top);
  const box = { width: 560, height: 180 };
  const bars = barGeometry(values, box, { top });
  const planY = plan !== undefined ? valueToY(plan, top, box.height) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm" style={{ backgroundColor: SERIES_HUES[0] }} />
          {t('widget.output.actual')}
        </span>
        {plan !== undefined ? (
          <span className="flex items-center gap-1">
            <span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: SERIES_HUES[2] }} />
            {t('widget.output.plan')}
          </span>
        ) : null}
      </div>

      {/* The full chart, from 1024px up. */}
      <div className="hidden min-h-0 flex-1 lg:block">
        <svg viewBox="0 0 600 200" className="h-full w-full" role="img" aria-label={t('widget.output.againstPlan')}>
          {ticks.map((tick) => {
            const y = valueToY(tick, top, box.height);
            return (
              <g key={tick}>
                <line x1={38} x2={600} y1={y} y2={y} stroke="#e7e2d8" strokeWidth={1} />
                <text x={32} y={y + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: 9 }}>
                  {compactTick(tick)}
                </text>
              </g>
            );
          })}
          <g transform="translate(38,0)">
            {bars.map((bar) => (
              <rect key={bar.index} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx={2} fill={SERIES_HUES[0]} />
            ))}
            {planY !== null ? (
              <line x1={0} x2={box.width} y1={planY} y2={planY} stroke={SERIES_HUES[2]} strokeWidth={1.5} strokeDasharray="6 4" />
            ) : null}
          </g>
        </svg>
      </div>

      {/* Below 1024px the same numbers, as a sparkline. */}
      <div className="lg:hidden">
        <Sparkline values={values} hue={SERIES_HUES[0]} />
      </div>

      <p className="mt-1 text-xs text-slate-500">{t('widget.output.readOffAxis')}</p>
    </div>
  );
}
