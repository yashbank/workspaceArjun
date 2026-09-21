/**
 * The maths behind D5's machine day timeline — "nine hours of twenty-one machines at once".
 *
 * D5's rules, each a function here so it is tested as logic and not read off a picture:
 *
 * - **Free time is a gap, not a colour.** A machine with nothing booked has an EMPTY row. The
 *   only things drawn are bookings and downtime; availability is the shape of what is not there.
 *   (`buildMachineTimeline` returns bars only for real allocations and for down machines.)
 * - **Booked and running look different.** Solid is happening, pale is promised, and a finished
 *   booking is a third thing — a supervisor who cannot tell them apart double-books. (`kind`)
 * - **Downtime is hatched, not just red** — that is the component's job, but the rule it draws
 *   from is here: a down machine gets ONE full-row bar of kind `DOWN`.
 * - **The panel answers the next question.** "Free right now", with when each frees up.
 * - **One shift definition, read from settings** (D5): the window is an input, never a constant.
 *
 * Time is the factory's (D22). Every position is minutes on the SHIFT'S OWN AXIS — minutes from
 * midnight of the day the shift instance started, so a night shift that runs past midnight
 * keeps a single increasing axis (22:00 → 30:00) and nothing here reads a server-local clock.
 *
 * Pure: no Prisma, no React.
 */

import { addDaysToDateKey, factoryDateKey, factoryMinuteOfDay } from './factory-time';

export type ShiftAxis = {
  /** Minutes-of-day the shift starts. */
  startMinute: number;
  /** Minutes-of-day it ends; an overnight shift has `endMinute` <= `startMinute`. */
  endMinute: number;
  /** The factory date this shift instance STARTED on. */
  dateKey: string;
  timeZone: string;
};

/** The window on the axis: `[from, to)`. */
export function shiftWindow(shift: Pick<ShiftAxis, 'startMinute' | 'endMinute'>): { from: number; to: number } {
  const to = shift.endMinute <= shift.startMinute ? shift.endMinute + 1440 : shift.endMinute;
  return { from: shift.startMinute, to };
}

const dayIndex = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86_400_000);

/** Minutes from midnight of `dateKey` to `at`, in the factory zone. Can exceed 1440 or be negative. */
export function axisMinute(at: Date, dateKey: string, timeZone: string): number {
  return (dayIndex(factoryDateKey(at, timeZone)) - dayIndex(dateKey)) * 1440 + factoryMinuteOfDay(at, timeZone);
}

/** `HH:MM` for a minute on the axis (30:00 → 06:00). */
export function axisLabel(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export type MachineInput = {
  id: string;
  name: string;
  code: string;
  machineType: string | null;
  department: string | null;
  isActive: boolean;
};

export type AllocationInput = {
  machineId: string;
  startsAt: Date;
  endsAt: Date;
  orderNumber: string | null;
  processName: string | null;
};

export type BarKind = 'RUNNING' | 'BOOKED' | 'FINISHED' | 'DOWN';

export type TimelineBar = {
  machineId: string;
  kind: BarKind;
  /** Minutes on the axis, already clipped to the shift window. */
  from: number;
  to: number;
  /** The booking began before the window / ends after it — drawn flush to the edge. */
  clippedStart: boolean;
  clippedEnd: boolean;
  orderNumber: string | null;
  processName: string | null;
  startLabel: string;
  endLabel: string;
};

export type MachineStatus = 'RUNNING' | 'FREE' | 'DOWN';

export type MachineRow = MachineInput & { status: MachineStatus };

export type FreeNow = { id: string; name: string; /** `null` = free for the whole rest of the shift */ freeUntil: string | null };

export type Utilisation = { machineId: string; name: string; percent: number; down: boolean };

export type MachineTimeline = {
  window: { from: number; to: number };
  /** Where "now" falls on the axis, or null when it is outside the window. */
  nowMinute: number | null;
  /** Every machine, in the order given — the caller decides ordering. */
  machines: MachineRow[];
  /** Machines that earn a row: they have a booking in the window, or are down. */
  shown: MachineRow[];
  bars: TimelineBar[];
  freeNow: FreeNow[];
  utilisation: Utilisation[];
  counts: { total: number; running: number; free: number; down: number };
};

/**
 * Build the whole day view.
 *
 * `weekAllocations` should cover Monday of the shift's week up to the shift day; the bars and
 * "free now" use only the allocations that overlap THIS shift instance, and utilisation uses all
 * of them, day by day.
 */
export function buildMachineTimeline(
  machines: readonly MachineInput[],
  weekAllocations: readonly AllocationInput[],
  shift: ShiftAxis,
  now: Date,
): MachineTimeline {
  const window = shiftWindow(shift);
  const nowAxis = axisMinute(now, shift.dateKey, shift.timeZone);
  const nowMinute = nowAxis >= window.from && nowAxis < window.to ? nowAxis : null;
  const downIds = new Set(machines.filter((m) => !m.isActive).map((m) => m.id));

  // --- bars for THIS shift instance ------------------------------------------------------
  const bars: TimelineBar[] = [];
  for (const a of weekAllocations) {
    if (downIds.has(a.machineId)) continue; // a down machine shows downtime, not a stale booking
    const start = axisMinute(a.startsAt, shift.dateKey, shift.timeZone);
    const end = axisMinute(a.endsAt, shift.dateKey, shift.timeZone);
    if (end <= window.from || start >= window.to) continue;

    const kind: BarKind = nowAxis >= end ? 'FINISHED' : nowAxis >= start ? 'RUNNING' : 'BOOKED';
    const from = Math.max(start, window.from);
    const to = Math.min(end, window.to);
    bars.push({
      machineId: a.machineId,
      kind,
      from,
      to,
      clippedStart: start < window.from,
      clippedEnd: end > window.to,
      orderNumber: a.orderNumber,
      processName: a.processName,
      startLabel: axisLabel(start),
      endLabel: axisLabel(end),
    });
  }

  // Downtime: ONE bar across the whole window for each down machine. Free time is deliberately
  // NOT a bar — "painting idle time green would fill the screen with reassurance".
  for (const m of machines) {
    if (m.isActive) continue;
    bars.push({
      machineId: m.id, kind: 'DOWN', from: window.from, to: window.to, clippedStart: false, clippedEnd: false,
      orderNumber: null, processName: null, startLabel: axisLabel(window.from), endLabel: axisLabel(window.to),
    });
  }

  bars.sort((a, b) => a.from - b.from);

  const runningIds = new Set(bars.filter((b) => b.kind === 'RUNNING').map((b) => b.machineId));
  const rows: MachineRow[] = machines.map((m) => ({
    ...m,
    status: !m.isActive ? 'DOWN' : runningIds.has(m.id) ? 'RUNNING' : 'FREE',
  }));

  const barMachines = new Set(bars.map((b) => b.machineId));
  const shown = rows.filter((m) => barMachines.has(m.id));

  // --- free right now, and when it frees up -----------------------------------------------
  const freeNow: FreeNow[] = rows
    .filter((m) => m.status === 'FREE')
    .map((m) => {
      const upcoming = bars.filter((b) => b.machineId === m.id && b.kind === 'BOOKED').sort((a, b) => a.from - b.from)[0];
      return { id: m.id, name: m.name, freeUntil: upcoming ? axisLabel(upcoming.from) : null };
    })
    .sort((a, b) => (a.freeUntil === null ? 1 : 0) - (b.freeUntil === null ? 1 : 0) || a.name.localeCompare(b.name));

  return {
    window,
    nowMinute,
    machines: rows,
    shown,
    bars,
    freeNow,
    utilisation: weeklyUtilisation(rows, weekAllocations, shift),
    counts: {
      total: rows.length,
      running: rows.filter((m) => m.status === 'RUNNING').length,
      free: rows.filter((m) => m.status === 'FREE').length,
      down: rows.filter((m) => m.status === 'DOWN').length,
    },
  };
}

/** Monday of the ISO week containing `dateKey`. */
export function weekStartKey(dateKey: string): string {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysToDateKey(dateKey, -((weekday + 6) % 7));
}

/**
 * Booked hours as a share of the shift, Monday to the shift day — "booked, not actually-run".
 *
 * Every day of the week so far counts in the denominator whether or not anything ran, because
 * the question is "how much of the shift was this machine promised for", and a machine idle on
 * Tuesday is exactly what utilisation exists to show. A down machine reports 0 and is flagged,
 * so the bar reads "down" rather than a misleading "idle".
 *
 * Each allocation is clipped to each day's own shift window, so a booking that spills past the
 * end of a shift counts only what falls inside it; and a machine is capped at 100% so a
 * double-booking (which the database refuses) could never draw a bar taller than the axis.
 */
export function weeklyUtilisation(
  machines: readonly MachineRow[],
  weekAllocations: readonly AllocationInput[],
  shift: ShiftAxis,
): Utilisation[] {
  const window = shiftWindow(shift);
  const duration = window.to - window.from;
  const firstDay = weekStartKey(shift.dateKey);
  const days: string[] = [];
  for (let key = firstDay; key <= shift.dateKey; key = addDaysToDateKey(key, 1)) days.push(key);
  const available = duration * days.length;

  return machines.map((m) => {
    if (!m.isActive) return { machineId: m.id, name: m.name, percent: 0, down: true };
    if (available <= 0) return { machineId: m.id, name: m.name, percent: 0, down: false };

    let booked = 0;
    for (const a of weekAllocations) {
      if (a.machineId !== m.id) continue;
      for (const day of days) {
        const start = axisMinute(a.startsAt, day, shift.timeZone);
        const end = axisMinute(a.endsAt, day, shift.timeZone);
        booked += Math.max(0, Math.min(end, window.to) - Math.max(start, window.from));
      }
    }
    return { machineId: m.id, name: m.name, percent: Math.min(100, Math.round((booked / available) * 100)), down: false };
  });
}

/** Position of a minute in the window as a percentage — the whole timeline is this one function. */
export function percentAcross(minute: number, window: { from: number; to: number }): number {
  const span = window.to - window.from;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((minute - window.from) / span) * 100));
}

/** One whole-hour tick per column: 06, 07, … for a 06:00–15:00 window. */
export function hourTicks(window: { from: number; to: number }): { minute: number; label: string }[] {
  const ticks: { minute: number; label: string }[] = [];
  for (let m = Math.ceil(window.from / 60) * 60; m < window.to; m += 60) {
    ticks.push({ minute: m, label: String(Math.floor(m / 60) % 24).padStart(2, '0') });
  }
  return ticks;
}
