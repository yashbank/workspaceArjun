/**
 * R2-216 - several breaks in one day. Pure; no database, no money.
 *
 * Each break is a row {outAt, inAt}; inAt is null while the break is still open. The legacy single
 * breakOutAt / breakInAt pair on the attendance row is only used when a day has no rows at all.
 */
import { factoryMinuteOfDay } from './factory-time';

export type BreakKind = 'MEAL' | 'TEA' | 'OTHER';
export type BreakRow = { kind?: BreakKind | string; outAt: Date; inAt: Date | null };
export type LegacyBreak = { breakOut: Date | null; breakIn: Date | null } | null | undefined;

/** Plain, serialisable shape handed to screens. */
export type BreakShape = { kind: BreakKind; outAt: string; inAt: string | null; minutes: number };

const MS_PER_MINUTE = 60_000;

/**
 * Guess the kind from the factory clock at break-out (an explicit kind on the punch always wins, callers pass it):
 * 11:30-14:59 MEAL; 10:00-11:29 and 15:00-17:29 TEA; anything else OTHER.
 */
export function guessBreakKind(outAt: Date, timeZone: string): BreakKind {
  const m = factoryMinuteOfDay(outAt, timeZone);
  if (m >= 11 * 60 + 30 && m < 15 * 60) return 'MEAL';
  if ((m >= 10 * 60 && m < 11 * 60 + 30) || (m >= 15 * 60 && m < 17 * 60 + 30)) return 'TEA';
  return 'OTHER';
}

/** Closed, forward intervals only; open or inverted/zero rows are ignored. */
function closedIntervals(rows: BreakRow[]): Array<[number, number]> {
  return rows
    .filter((r) => r.inAt && r.inAt.getTime() > r.outAt.getTime())
    .map((r) => [r.outAt.getTime(), r.inAt!.getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Total minutes spent on break. Overlapping rows count once (union of intervals). Open-ended and zero-length rows
 * count 0. With no rows at all the legacy pair is used (same rule: open or inverted = 0).
 */
export function totalBreakMinutes(rows: BreakRow[] | null | undefined, legacy?: LegacyBreak): number {
  if (!rows || rows.length === 0) {
    if (!legacy?.breakOut || !legacy.breakIn || legacy.breakIn <= legacy.breakOut) return 0;
    return Math.round((legacy.breakIn.getTime() - legacy.breakOut.getTime()) / MS_PER_MINUTE);
  }
  let ms = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of closedIntervals(rows)) {
    if (curEnd < 0 || s > curEnd) {
      if (curEnd >= 0) ms += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) curEnd = e;
  }
  if (curEnd >= 0) ms += curEnd - curStart;
  return Math.round(ms / MS_PER_MINUTE);
}

/** Unpaid minutes for the day: all break time beyond the paid lunch allowance (R2-179 allowance applies once a day). */
export function unpaidTotalBreakMinutes(rows: BreakRow[] | null | undefined, legacy: LegacyBreak, paidMinutes: number): number {
  return Math.max(0, totalBreakMinutes(rows, legacy) - Math.max(0, paidMinutes));
}

export function toBreakShapes(rows: BreakRow[] | null | undefined): BreakShape[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => a.outAt.getTime() - b.outAt.getTime())
    .map((r) => ({
      kind: (r.kind === 'MEAL' || r.kind === 'TEA' ? r.kind : 'OTHER') as BreakKind,
      outAt: r.outAt.toISOString(),
      inAt: r.inAt ? r.inAt.toISOString() : null,
      minutes: totalBreakMinutes([r]),
    }));
}

export type BreakPunchDay = {
  clockIn: Date | null;
  clockOut: Date | null;
  breakOutAt: Date | null;
  breakInAt: Date | null;
  breaks: Array<{ id: string; outAt: Date; inAt: Date | null; kind?: string }>;
};

export type BreakPunchPlan =
  | { skip: string }
  | {
      /** Break-out: create a new open row. Break-in: close `closeId` (or, for a legacy-only open break, create the row). */
      op: 'OPEN' | 'CLOSE';
      closeId: string | null;
      /** Legacy pair that has no row yet; the writer backfills it as a row so no earlier break is lost. */
      backfillLegacy: { outAt: Date; inAt: Date | null } | null;
      outAt: Date;
      /** Mirror the legacy columns when this is the day's first break. */
      legacy: { breakOutAt?: Date; breakInAt?: Date };
    };

/**
 * Decide what a break punch does on a day. Multiple breaks per day are fine; only a second OUT while one is open,
 * an IN with nothing open, or a time that runs backwards is refused. Same reason strings as before R2-216.
 */
export function planBreakPunch(kind: 'OUT' | 'IN', day: BreakPunchDay, at: Date): BreakPunchPlan {
  if (!day.clockIn) return { skip: 'Not clocked in' };
  if (day.clockOut) return { skip: 'Already clocked out' };
  if (at.getTime() <= day.clockIn.getTime()) return { skip: 'Before the clock-in' };
  const rows = [...(day.breaks ?? [])].sort((a, b) => a.outAt.getTime() - b.outAt.getTime());
  const legacyOnly = rows.length === 0 && day.breakOutAt ? { outAt: day.breakOutAt, inAt: day.breakInAt } : null;
  const open = rows.find((r) => !r.inAt) ?? null;
  const lastEnd = Math.max(0, ...rows.map((r) => (r.inAt ?? r.outAt).getTime()), legacyOnly ? (legacyOnly.inAt ?? legacyOnly.outAt).getTime() : 0);

  if (kind === 'OUT') {
    if (open || (legacyOnly && !legacyOnly.inAt)) return { skip: 'Break already started' };
    if (at.getTime() <= lastEnd) return { skip: 'Before the last break-in' };
    const first = rows.length === 0 && !legacyOnly;
    return { op: 'OPEN', closeId: null, backfillLegacy: legacyOnly, outAt: at, legacy: first ? { breakOutAt: at } : {} };
  }
  if (!open && legacyOnly?.inAt) return { skip: 'Break already ended' };
  if (!open && !legacyOnly) return { skip: 'Break not started' };
  const outAt = open ? open.outAt : legacyOnly!.outAt;
  if (at.getTime() <= outAt.getTime()) return { skip: 'Before the break-out' };
  const isFirst = open ? rows[0] === open && !day.breakInAt : true;
  return { op: 'CLOSE', closeId: open?.id ?? null, backfillLegacy: null, outAt, legacy: isFirst ? { breakInAt: at } : {} };
}
