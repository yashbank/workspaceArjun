/**
 * Turning a person's punches into attendance days — pure, no Prisma, no clock
 * (Phase 13, MIS-240; D20).
 *
 * THE RULE THE WHOLE PHASE RESTS ON: a day is a *function of the punches*, not
 * something each arrival patches. Give it the same set of punches in any order,
 * with duplicates, hours late — it returns the same days. That is what makes
 * "a clock-out that arrives before its clock-in" and "the same punch five times"
 * harmless: neither can leave a day different from the one the punches describe.
 *
 * Shift arithmetic is the shared helper in `shift-window.ts` (MIS-233), extended
 * with one function — there is deliberately no second implementation of "is this
 * minute inside the shift" here.
 *
 * EVERY calendar decision takes the factory's timezone as an explicit argument
 * (D22). Nothing here reads the server's local time — not `getHours()`, not
 * `setHours()`, not `toLocaleDateString()` — because the database and the plant are
 * 2.5 hours apart and a night-shift punch lands on the wrong day if they are
 * confused. The zone is required, never defaulted.
 */
import { addDaysToDateKey, factoryDateKey, previousDateKey } from './factory-time';
import {
  isMinuteInShiftWindow,
  minuteOfDay,
  shiftWrapsMidnight,
  timeToMinutes,
  type ShiftWindow,
} from './shift-window';

export type PunchDirection = 'IN' | 'OUT';

/** A punch as the day derivation sees it: the facts, nothing about who sent it. */
export type PunchFact = {
  id: string;
  direction: PunchDirection;
  /** The device's time (D15) — never the server's arrival time. */
  punchedAt: Date;
  /** The shift the device says this person is on, if it said (see `workDateFor`). */
  shiftId?: string | null;
};

export type ShiftDef = ShiftWindow & { id: string; name?: string };

/**
 * The longest a single stretch of work may be, from clock-in to clock-out.
 *
 * It separates "one long shift with a break" from "forgot to clock out
 * yesterday, clocked in today". Sixteen hours covers a 12-hour shift plus
 * overtime; anything longer is two days (D20).
 */
export const MAX_SHIFT_SPAN_HOURS = 16;
const MAX_SPAN_MS = MAX_SHIFT_SPAN_HOURS * 60 * 60 * 1000;

export type WorkDate = { workDate: string; shiftId: string | null };

/**
 * Which attendance day, and which shift, does a punch at `at` belong to?
 *
 * A night shift (22:00–06:00) crosses midnight, and its small-hours minutes belong
 * to the day it STARTED: a clock-in at 00:10 for a 22:00 start is the previous
 * calendar day's attendance, not tomorrow's.
 *
 * The shift is the device's stated shift (`hintShiftId`) when it names a real
 * one, otherwise the shift whose window contains `at`. The hint exists because
 * windows overlap the way people do: someone arriving at 05:50 for a 06:00 day
 * shift is, by the clock alone, inside the night shift that ends at 06:00. The
 * device knows who it scanned and what shift that person is on (D19); the clock
 * cannot.
 */
export function workDateFor(
  at: Date,
  shifts: readonly ShiftDef[],
  timeZone: string,
  hintShiftId?: string | null,
): WorkDate {
  const calendar = factoryDateKey(at, timeZone);
  const minute = minuteOfDay(at, timeZone);
  const hinted = hintShiftId ? shifts.find((s) => s.id === hintShiftId) : undefined;
  const shift = hinted ?? shifts.find((s) => isMinuteInShiftWindow(minute, s));
  if (!shift) return { workDate: calendar, shiftId: null };

  const belongsToPreviousDay = shiftWrapsMidnight(shift) && minute < timeToMinutes(shift.endTime);
  return { workDate: belongsToPreviousDay ? previousDateKey(calendar) : calendar, shiftId: shift.id };
}

export type DerivedDay = {
  workDate: string;
  /** The earliest clock-in attributed to this day, or null if only clock-outs have arrived. */
  clockIn: Date | null;
  /** The latest clock-out attributed to this day, or null if the person has not left. */
  clockOut: Date | null;
  shiftId: string | null;
  /** Every active punch that contributed, for the audit trail. */
  punchIds: string[];
};

type Session = { in: PunchFact | null; out: PunchFact | null };

/**
 * Pair a person's punches into stretches of work.
 *
 *  - A clock-in opens a stretch. Another clock-in inside the same stretch is
 *    ignored — the tablet is meant to stop a second scan (K7), and if it did not,
 *    the first one stands.
 *  - A clock-out closes the open stretch; a later clock-out extends it (a lunch
 *    break inside one shift is just time between the first in and the last out).
 *  - A clock-out with nothing open — its clock-in has not arrived, or was never
 *    made — is kept as a stretch of its own, so the person still shows as having
 *    been there. If the clock-in arrives later, the next derivation pairs them and
 *    the lone stretch disappears.
 *  - A gap over `MAX_SHIFT_SPAN_HOURS` starts a new stretch: forgetting to clock
 *    out yesterday must not swallow today's clock-in.
 */
function pairSessions(sorted: readonly PunchFact[]): Session[] {
  const sessions: Session[] = [];
  let open: Session | null = null;

  for (const p of sorted) {
    if (p.direction === 'IN') {
      if (open && p.punchedAt.getTime() - open.in!.punchedAt.getTime() <= MAX_SPAN_MS) continue;
      if (open) sessions.push(open);
      open = { in: p, out: null };
    } else if (open && p.punchedAt.getTime() - open.in!.punchedAt.getTime() <= MAX_SPAN_MS) {
      open.out = p;
    } else {
      sessions.push({ in: null, out: p });
    }
  }
  if (open) sessions.push(open);
  return sessions;
}

/**
 * All of one person's active punches → their attendance days.
 *
 * Order-independent and duplicate-tolerant by construction: punches are
 * de-duplicated by id and sorted here, so the caller's ordering is irrelevant.
 * Superseded punches must be filtered out by the caller — this function knows
 * nothing about corrections, only about active facts.
 */
export function deriveDays(
  punches: readonly PunchFact[],
  shifts: readonly ShiftDef[],
  timeZone: string,
): Map<string, DerivedDay> {
  const unique = new Map<string, PunchFact>();
  for (const p of punches) unique.set(p.id, p);
  const sorted = [...unique.values()].sort(
    (a, b) => a.punchedAt.getTime() - b.punchedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const days = new Map<string, DerivedDay>();
  for (const s of pairSessions(sorted)) {
    const anchor = (s.in ?? s.out)!;
    const { workDate, shiftId } = workDateFor(anchor.punchedAt, shifts, timeZone, anchor.shiftId);
    const day = days.get(workDate) ?? { workDate, clockIn: null, clockOut: null, shiftId, punchIds: [] };

    if (s.in && (!day.clockIn || s.in.punchedAt < day.clockIn)) day.clockIn = s.in.punchedAt;
    if (s.out && (!day.clockOut || s.out.punchedAt > day.clockOut)) day.clockOut = s.out.punchedAt;
    if (!day.shiftId) day.shiftId = shiftId;
    for (const p of [s.in, s.out]) if (p) day.punchIds.push(p.id);
    days.set(workDate, day);
  }
  return days;
}

export type DayPlan = {
  /** Days whose derived clock times are new or changed — write these. */
  upsert: DerivedDay[];
  /**
   * Days that existed in the previous derivation and no longer do — e.g. the lone
   * clock-out that filed itself under the wrong day until its clock-in arrived.
   * The caller clears what the punches had put there, and never touches a day a
   * person edited by hand.
   */
  vacated: string[];
};

const sameTime = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** What must change in the register when one punch is added: compare "without it" to "with it". */
export function planDayUpdates(before: ReadonlyMap<string, DerivedDay>, after: ReadonlyMap<string, DerivedDay>): DayPlan {
  const upsert: DerivedDay[] = [];
  for (const [key, day] of after) {
    const prev = before.get(key);
    if (!prev || !sameTime(prev.clockIn, day.clockIn) || !sameTime(prev.clockOut, day.clockOut) || prev.shiftId !== day.shiftId) {
      upsert.push(day);
    }
  }
  const vacated = [...before.keys()].filter((k) => !after.has(k));
  return { upsert, vacated };
}

/**
 * Is a punch's attendance day still inside the window in which the register may
 * be corrected? `windowDays` counts today: three days means today and the two
 * before it. "Today" is the factory's today, not the server's (D22). Past the
 * window a punch is parked for the Super Attendance Operator rather than silently
 * rewriting a closed day (Phase 13 acceptance; D21).
 */
export function isWithinCorrectionWindow(workDate: string, now: Date, windowDays: number, timeZone: string): boolean {
  const cutoff = addDaysToDateKey(factoryDateKey(now, timeZone), -(windowDays - 1));
  return workDate >= cutoff;
}

// Re-exported so callers of the day derivation need one import for the whole subject.
export { factoryDateKey, previousDateKey };
