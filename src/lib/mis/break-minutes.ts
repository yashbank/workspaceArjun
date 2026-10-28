/**
 * R2-179 — lunch is PAID. A break up to the Owner-set allowance costs nothing; only the minutes beyond it are
 * unpaid. Pure. Overtime stays the one `punchMinutes` rule: the unpaid excess just pulls the effective clock-out earlier.
 */
import { punchMinutes, type PunchMinutes } from './punch-minutes';
import type { ShiftWindow } from './shift-window';

/** Unpaid minutes: break length beyond the paid allowance. An open or inverted break counts as 0. */
export function unpaidBreakMinutes(breakOut: Date | null, breakIn: Date | null, paidMinutes: number): number {
  if (!breakOut || !breakIn || breakIn <= breakOut) return 0;
  const taken = Math.round((breakIn.getTime() - breakOut.getTime()) / 60_000);
  return Math.max(0, taken - Math.max(0, paidMinutes));
}

/** Net worked minutes = clock-in to clock-out minus the unpaid excess; null until both punches exist. */
export function netWorkedMinutes(
  day: { clockIn: Date | null; clockOut: Date | null; breakOut: Date | null; breakIn: Date | null },
  paidMinutes: number,
): number | null {
  if (!day.clockIn || !day.clockOut) return null;
  const span = Math.round((day.clockOut.getTime() - day.clockIn.getTime()) / 60_000);
  return Math.max(0, span - unpaidBreakMinutes(day.breakOut, day.breakIn, paidMinutes));
}

/** Late/OT for a day with a break: OT is measured from the clock-out less the unpaid excess. */
export function punchMinutesNet(
  day: { workDate: string; clockIn: Date | null; clockOut: Date | null; breakOut: Date | null; breakIn: Date | null },
  shift: ShiftWindow | null | undefined,
  timeZone: string,
  paidMinutes: number,
): PunchMinutes {
  const excess = unpaidBreakMinutes(day.breakOut, day.breakIn, paidMinutes);
  const clockOut = day.clockOut ? new Date(day.clockOut.getTime() - excess * 60_000) : null;
  return punchMinutes({ workDate: day.workDate, clockIn: day.clockIn, clockOut }, shift, timeZone);
}
