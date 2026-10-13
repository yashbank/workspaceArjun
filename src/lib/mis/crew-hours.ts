/**
 * Crew time arithmetic (R3 B93, B102). Pure: no Prisma, no React. Time is the factory's.
 */
import { factoryDateKey, factoryMinuteOfDay, addDaysToDateKey } from './factory-time';
import { axisMinute, shiftWindow } from './machine-timeline';
import { timeToMinutes } from './shift-window';

type ShiftTimes = { startTime: string; endTime: string };

/** The instant at `minute` minutes from midnight of `dateKey` in the factory zone (can exceed 1440). */
export function instantAtAxisMinute(dateKey: string, minute: number, timeZone: string): Date {
  let t = Date.parse(`${dateKey}T00:00:00Z`) + minute * 60_000;
  // Converge on the zone's offset: two passes settle any fixed-offset zone and any DST edge but the gap itself.
  for (let i = 0; i < 2; i += 1) t += (minute - axisMinute(new Date(t), dateKey, timeZone)) * 60_000;
  return new Date(t);
}

/** A shift instance as instants. A night shift's end falls on the next factory day. */
export function shiftWindowInstants(dateKey: string, shift: ShiftTimes, timeZone: string): { start: Date; end: Date } {
  const { from, to } = shiftWindow({ startMinute: timeToMinutes(shift.startTime), endMinute: timeToMinutes(shift.endTime) });
  return { start: instantAtAxisMinute(dateKey, from, timeZone), end: instantAtAxisMinute(dateKey, to, timeZone) };
}

/** Does a booking overlap the shift instance on `dateKey`? Night shifts cross midnight. */
export function bookingIntersectsShift(
  booking: { startsAt: Date; endsAt: Date },
  dateKey: string,
  shift: ShiftTimes,
  timeZone: string,
): boolean {
  const w = shiftWindowInstants(dateKey, shift, timeZone);
  return booking.startsAt.getTime() < w.end.getTime() && booking.endsAt.getTime() > w.start.getTime();
}

/**
 * The factory date the shift instance running (or next due) at `now` belongs to: a 22:00-06:00
 * shift looked at 01:00 STARTED yesterday. For any other shift it is today.
 */
export function shiftDateKeyFor(shift: ShiftTimes, now: Date, timeZone: string): string {
  const key = factoryDateKey(now, timeZone);
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);
  const wraps = end <= start;
  if (wraps && factoryMinuteOfDay(now, timeZone) < end) return addDaysToDateKey(key, -1);
  return key;
}

/** A real `YYYY-MM-DD` calendar date (not 2026-02-31, not an ISO timestamp). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

/**
 * Minutes one person spent on a booking: from the latest of (row created, shift start, clock-in) to
 * the earliest of (released, shift end, booking end, and now while the row is open). Never negative.
 */
export function personMinutes(i: {
  createdAt: Date;
  releasedAt: Date | null;
  clockIn: Date | null;
  shiftStart: Date;
  shiftEnd: Date;
  bookingEnd: Date;
  now: Date;
}): number {
  const start = Math.max(i.createdAt.getTime(), i.shiftStart.getTime(), i.clockIn ? i.clockIn.getTime() : -Infinity);
  const end = Math.min((i.releasedAt ?? i.now).getTime(), i.shiftEnd.getTime(), i.bookingEnd.getTime());
  return Math.max(0, (end - start) / 60_000);
}
