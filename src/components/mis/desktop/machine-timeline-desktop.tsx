'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { SERIES_HUES, STATE_HUES } from '@/lib/mis/chart';
import { axisLabel, hourTicks, percentAcross, type MachineRow, type TimelineBar } from '@/lib/mis/machine-timeline';
import { cn } from '@/lib/utils';
import type { MachineDayTimeline } from '@/server/mis/machines-board';

import { useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';

/**
 * D5 — "Nine hours of twenty-one machines at once — the one view a phone cannot draw."
 *
 * **Free time is a gap, not a colour.** A machine with nothing booked has an empty row, so
 * availability is the SHAPE of a row and the eye finds a gap faster than it reads a legend. The
 * only fills are bookings and downtime; nothing here is ever painted green for "idle".
 *
 * **Booked and running look different**: solid indigo is happening, pale indigo is promised, and
 * a booking whose time has passed is grey (the data knows the time elapsed, not that the job finished). **Downtime is hatched**, so it survives greyscale printing and
 * colour-blindness and reads as "unavailable" rather than "busy".
 *
 * **Below 1024px this whole component is absent** — the page renders it `hidden lg:block` — so
 * the toggle that offers it does not exist there. D5: "the timeline is dropped entirely, not
 * squeezed … and the toggle that offers this view is absent there rather than disabled." The
 * phone falls back to the card grid.
 *
 * **Types import only** from the server module: a `'use client'` file never imports server code
 * by value.
 */

const NOW_HUE = '#d9701c';
const HATCH =
  'repeating-linear-gradient(45deg, rgba(220,38,38,0.22) 0 6px, rgba(220,38,38,0.08) 6px 12px)';

export type MachineTimelineDesktopProps = {
  data: MachineDayTimeline | null;
  /** The existing card grid (P1), rendered by the page — the other half of the Grid | Day timeline toggle. */
  gridView: ReactNode;
  /** Plain "07/09" label, formatted on the server in the factory's zone (D22). */
  todayLabel: string;
};

export function MachineTimelineDesktop({ data, gridView, todayLabel }: MachineTimelineDesktopProps) {
  const t = useT();
  const [view, setView] = useState<'timeline' | 'grid'>(data ? 'timeline' : 'grid');
  const timeline = data?.timeline ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (!timeline) return null;
    return (timeline.shown.find((m) => m.status === 'DOWN') ?? timeline.shown[0])?.id ?? null;
  });
  const selected = useMemo(() => timeline?.machines.find((m) => m.id === selectedId) ?? null, [timeline, selectedId]);

  const counts = timeline?.counts;
  const summary = counts
    ? [
        `${counts.total} ${t('nav.machines').toLowerCase()}`,
        `${counts.running} ${t('d5.running')}`,
        `${counts.free} ${t('d5.free')}`,
        `${counts.down} ${t('d5.down')}`,
        data ? `${data.shift.name}, ${axisLabel(data.shift.startMinute)} – ${axisLabel(data.shift.endMinute)}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <div>
      <DesktopPageHeader
        title={t('nav.machines')}
        summary={summary}
        secondary={
          <>
            {/* Only offered when there is a timeline to switch to. Absent, never disabled. */}
            {data ? (
              <div role="group" aria-label={t('d5.viewSwitch')} className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                {(['grid', 'timeline'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={view === option}
                    onClick={() => setView(option)}
                    className={cn(
                      'min-h-11 rounded-md px-4 text-sm font-semibold',
                      view === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    {option === 'grid' ? t('d5.grid') : t('d5.dayTimeline')}
                  </button>
                ))}
              </div>
            ) : null}
            <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm">
              <span className="font-semibold text-slate-900">{t('d5.today')}</span>
              <span className="font-mono text-slate-500">{todayLabel}</span>
            </span>
          </>
        }
      />

      {!data ? (
        <p className="mb-4 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">{t('d5.noShift')}</p>
      ) : null}

      {view === 'grid' || !data || !timeline ? (
        gridView
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            <TimelineCard data={data} selectedId={selectedId} onSelect={setSelectedId} />
            <UtilisationCard timeline={timeline} />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <MachinePanel machine={selected} bars={timeline.bars.filter((b) => b.machineId === selectedId)} utilisation={timeline.utilisation.find((u) => u.machineId === selectedId)?.percent ?? null} />
            <FreeNowCard free={timeline.freeNow} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TimelineCard({ data, selectedId, onSelect }: { data: MachineDayTimeline; selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useT();
  const { timeline, shift } = data;
  const { window } = timeline;
  const ticks = hourTicks(window);
  const hours = (window.to - window.from) / 60;

  return (
    <Card>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          {shift.name} · {axisLabel(window.from)} – {axisLabel(window.to)}
        </h2>
        <span className="text-xs text-slate-500">
          {hours} {t('d5.hours')} · {timeline.shown.length} {t('d5.of')} {timeline.counts.total} {t('d5.shown')}
        </span>
      </header>

      {timeline.shown.length === 0 ? (
        // Nothing booked and nothing down: every machine is FREE. (Not "booked or down" — that
        // sentence belongs to the Free-now card, where it means the opposite.)
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{t('d5.nothingBooked')}</p>
      ) : (
        <div className="grid grid-cols-[160px_1fr] gap-y-2">
          {/* hour header */}
          <span />
          <div className="relative h-5 font-mono text-[11px] text-slate-400" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick.minute} className="absolute -translate-x-1/2" style={{ left: `${percentAcross(tick.minute, window)}%` }}>
                {tick.label}
              </span>
            ))}
          </div>

          {timeline.shown.map((machine) => (
            <MachineTrack key={machine.id} machine={machine} timeline={timeline} selected={machine.id === selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-3 text-xs text-slate-600">
        <Legend swatch={<span className="size-3 rounded-sm" style={{ backgroundColor: SERIES_HUES[0] }} />}>{t('d5.legend.running')}</Legend>
        <Legend swatch={<span className="size-3 rounded-sm" style={{ backgroundColor: '#c9c4ee' }} />}>{t('d5.legend.booked')}</Legend>
        <Legend swatch={<span className="size-3 rounded-sm bg-slate-300" />}>{t('d5.legend.finished')}</Legend>
        <Legend swatch={<span className="size-3 rounded-sm border border-red-300" style={{ backgroundImage: HATCH }} />}>{t('d5.legend.down')}</Legend>
        {timeline.nowMinute !== null ? (
          <Legend swatch={<span className="h-3 w-0.5" style={{ backgroundColor: NOW_HUE }} />}>
            {t('d5.legend.now')} · {axisLabel(timeline.nowMinute)}
          </Legend>
        ) : null}
        <span className="ml-auto font-mono text-[11px] text-slate-500">{t('d5.freeGap')}</span>
      </footer>
    </Card>
  );
}

function MachineTrack({
  machine,
  timeline,
  selected,
  onSelect,
}: {
  machine: MachineRow;
  timeline: MachineDayTimeline['timeline'];
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const bars = timeline.bars.filter((b) => b.machineId === machine.id);
  const dot = machine.status === 'DOWN' ? STATE_HUES.bad : machine.status === 'RUNNING' ? STATE_HUES.warn : STATE_HUES.good;

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(machine.id)}
        aria-pressed={selected}
        className={cn(
          'flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50',
          selected && 'bg-indigo-50 ring-1 ring-indigo-200',
        )}
      >
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden="true" />
        <span className="truncate">{machine.name}</span>
      </button>

      {/* An EMPTY track is a machine with nothing on it. Nothing is painted for free time. */}
      <div className="relative h-11 rounded-lg bg-[#faf7f2]" role="img" aria-label={`${machine.name}: ${bars.map(barSummary).join(', ') || '—'}`}>
        {timeline.nowMinute !== null ? (
          <span className="absolute inset-y-0 z-10 w-0.5" style={{ left: `${percentAcross(timeline.nowMinute, timeline.window)}%`, backgroundColor: NOW_HUE }} aria-hidden="true" />
        ) : null}
        {bars.map((bar, i) => (
          <Bar key={i} bar={bar} window={timeline.window} />
        ))}
      </div>
    </>
  );
}

function Bar({ bar, window }: { bar: TimelineBar; window: { from: number; to: number } }) {
  const t = useT();
  const left = percentAcross(bar.from, window);
  const width = Math.max(0.5, percentAcross(bar.to, window) - left);

  const label =
    bar.kind === 'DOWN'
      ? t('d5.downBar')
      : bar.kind === 'BOOKED'
        ? `${bar.orderNumber ?? '—'} · ${t('d5.booked')} ${bar.startLabel}`
        : [bar.orderNumber, bar.processName].filter(Boolean).join(' · ') || '—';

  const style =
    bar.kind === 'RUNNING'
      ? { backgroundColor: SERIES_HUES[0], color: '#fff' }
      : bar.kind === 'BOOKED'
        ? { backgroundColor: '#c9c4ee', color: SERIES_HUES[0] }
        : bar.kind === 'FINISHED'
          ? { backgroundColor: '#d8d4cb', color: '#57534e' }
          : { backgroundImage: HATCH, color: '#991b1b', border: '1px solid rgba(220,38,38,0.35)' };

  return (
    <span
      title={`${label} · ${bar.startLabel}–${bar.endLabel}`}
      data-kind={bar.kind}
      className={cn(
        'absolute inset-y-1 flex items-center overflow-hidden whitespace-nowrap px-2 font-mono text-[11px] font-semibold',
        bar.clippedStart ? 'rounded-l-none' : 'rounded-l-md',
        bar.clippedEnd ? 'rounded-r-none' : 'rounded-r-md',
      )}
      style={{ left: `${left}%`, width: `${width}%`, ...style }}
    >
      {label}
    </span>
  );
}

function barSummary(bar: TimelineBar): string {
  return `${bar.kind.toLowerCase()} ${bar.startLabel}–${bar.endLabel}${bar.orderNumber ? ` ${bar.orderNumber}` : ''}`;
}

// ---------------------------------------------------------------------------

function UtilisationCard({ timeline }: { timeline: MachineDayTimeline['timeline'] }) {
  const t = useT();
  const rows = timeline.utilisation.filter((u) => timeline.machines.find((m) => m.id === u.machineId && (u.percent > 0 || u.down)));

  return (
    <Card>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t('d5.utilisation')}</h2>
        <span className="text-xs text-slate-500">{t('d5.utilisationNote')}</span>
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{t('d5.noBookings')}</p>
      ) : (
        // ONE scale: every bar is a share of the same shift, 0 to 100, on the same axis.
        <ul className="flex h-40 items-end gap-3" aria-label={t('d5.utilisation')}>
          {[...rows]
            .sort((a, b) => b.percent - a.percent)
            .map((u) => (
              <li key={u.machineId} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className={cn('font-mono text-[11px] font-semibold', u.down ? 'text-red-700' : 'text-slate-700')}>{u.percent}%</span>
                <span
                  className="w-full max-w-14 rounded-t-md"
                  style={{ height: `${Math.max(u.down ? 2 : 0, u.percent) * 1.05}px`, backgroundColor: u.down ? 'rgba(220,38,38,0.35)' : SERIES_HUES[0] }}
                />
                <span className="w-full truncate text-center text-[11px] text-slate-600">{u.name}</span>
                {u.down ? <span className="text-[10px] font-semibold text-red-700">{t('d5.down')}</span> : null}
              </li>
            ))}
        </ul>
      )}
      <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d5.utilisationFoot')}</p>
    </Card>
  );
}

function MachinePanel({ machine, bars, utilisation }: { machine: MachineRow | null; bars: TimelineBar[]; utilisation: number | null }) {
  const t = useT();

  if (!machine) {
    return (
      <Card>
        <p className="text-sm text-slate-500">{t('d5.selectMachine')}</p>
      </Card>
    );
  }

  const meta = [machine.machineType, machine.department].filter(Boolean).join(' · ');

  return (
    <Card>
      <header className="mb-2 flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: machine.status === 'DOWN' ? STATE_HUES.bad : machine.status === 'RUNNING' ? STATE_HUES.warn : STATE_HUES.good }}
            aria-hidden="true"
          />
          {machine.name}
        </h2>
        {machine.status === 'DOWN' ? (
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">{t('d5.switchedOff')}</span>
        ) : null}
      </header>
      {meta ? <p className="mb-3 font-mono text-xs text-slate-500">{meta}</p> : null}

      {machine.status === 'DOWN' ? (
        // The artboard shows "down since · reported by · reason" and a "Mark back in service"
        // button. None of that is recorded, and nothing in the system can switch a machine on
        // or off, so this says what is true instead of inventing a time, a name or a button.
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{t('d5.downNotRecorded')}</p>
      ) : (
        <>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{t('d5.bookings')}</h3>
          {bars.length === 0 ? (
            <p className="text-sm text-slate-500">{t('d5.noBookings')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {bars.map((bar, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-slate-900">{[bar.orderNumber, bar.processName].filter(Boolean).join(' · ') || '—'}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-500">
                    {bar.startLabel}–{bar.endLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {utilisation !== null ? (
            <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600">
              {t('d5.utilisation')} <span className="font-mono font-semibold text-slate-900">{utilisation}%</span>
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

function FreeNowCard({ free }: { free: MachineDayTimeline['timeline']['freeNow'] }) {
  const t = useT();
  return (
    <Card>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t('d5.freeNow')}</h2>
        <span className="text-xs text-slate-500">
          {free.length} {t('nav.machines').toLowerCase()}
        </span>
      </header>
      {free.length === 0 ? (
        <p className="text-sm text-slate-500">{t('d5.noneFree')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {free.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STATE_HUES.good }} aria-hidden="true" />
                <span className="truncate">{f.name}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-slate-500">
                {f.freeUntil ? `${t('d5.freeTo')} ${f.freeUntil}` : t('d5.freeAll')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Legend({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">{children}</section>;
}
