/**
 * Shift time-window arithmetic — pure, client-safe, no Prisma.
 *
 * The canonical version of the wrap-past-midnight math that used to be
 * duplicated: once privately inside `attendance.ts`'s `getCurrentShiftName`
 * (MIS-233), and once more privately inside `line-clearance.ts` when D7
 * needed to know whether a granting shift had ended (Phase 6). Phase 8 needs
 * the same math a third time for worker-allocation overlap, which is the line
 * past which "just write it again" stops being cheaper than extracting it.
 * Every caller now composes this module instead.
 */

import { factoryMinuteOfDay } from './factory-time';

export type ShiftWindow = { startTime: string; endTime: string };

/** `"HH:MM"` → minutes since midnight. Malformed input reads as `0`, never `NaN`. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Minutes since midnight **on the factory's clock** (D22). The zone is required, not
 * defaulted: a shift window is a wall-clock time at the plant, and reading it from
 * the server's local clock puts a night shift's edges 2.5 hours out.
 */
export function minuteOfDay(at: Date, timeZone: string): number {
  return factoryMinuteOfDay(at, timeZone);
}

/** How long a shift runs, in minutes. A night shift wraps past midnight, so `end < start` is normal, not bad data. */
export function shiftDurationMinutes(shift: ShiftWindow): number {
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);
  return end > start ? end - start : 1440 - start + end;
}

/**
 * Does the shift run past midnight? A night shift (22:00–06:00) does, and its
 * small-hours minutes belong to the day it STARTED on — the fact that decides which
 * attendance day a 00:30 punch is for (Phase 13, D20).
 */
export function shiftWrapsMidnight(shift: ShiftWindow): boolean {
  return timeToMinutes(shift.endTime) <= timeToMinutes(shift.startTime);
}

/** Is this minute-of-day inside the shift's window? Handles the midnight wrap the same way. */
export function isMinuteInShiftWindow(minuteOfDayValue: number, shift: ShiftWindow): boolean {
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);
  return end > start
    ? minuteOfDayValue >= start && minuteOfDayValue < end
    : minuteOfDayValue >= start || minuteOfDayValue < end;
}

/**
 * Which of these shifts is `at` inside, by time-of-day — falling back to the
 * one marked default, then the first, so this never returns nothing when at
 * least one shift exists. Caller passes only active shifts.
 */
export function resolveShiftAt<T extends ShiftWindow & { isDefault?: boolean }>(
  shifts: T[],
  at: Date,
  timeZone: string,
): T | null {
  if (shifts.length === 0) return null;
  const minutes = minuteOfDay(at, timeZone);
  const current = shifts.find((s) => isMinuteInShiftWindow(minutes, s));
  return current ?? shifts.find((s) => s.isDefault) ?? shifts[0];
}

/**
 * Do two shift instances — one starting at `aAt` on shift `a`, one at `bAt` on
 * shift `b` — overlap in wall-clock time? Used for the worker double-booking
 * warning (MIS-262): same day, same shift is the common case and always
 * overlaps; this also catches an adjoining shift pair that share an edge.
 */
export function shiftsOverlap(
  a: ShiftWindow,
  aDate: Date,
  b: ShiftWindow,
  bDate: Date,
): boolean {
  if (aDate.getTime() !== bDate.getTime()) return false;
  const aStart = timeToMinutes(a.startTime);
  const aEnd = aStart + shiftDurationMinutes(a);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = bStart + shiftDurationMinutes(b);
  return aStart < bEnd && bStart < aEnd;
}
