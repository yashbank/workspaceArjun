/**
 * The current shift, as a window on the factory day — for the desktop timelines (D4, D5).
 *
 * D5's note is specific: "Shift 1 is 06:00 – 15:00, nine columns. One shift definition, read
 * from settings, never hardcoded per screen." So this reads `MisShift` and nothing else. It is
 * a separate function from `attendance.ts`'s shift list on purpose: that one is gated on
 * `attendance.read`, which QC does not hold, while a QC inspector opening an order or the
 * machine board needs the same window. `production.read` is the permission those screens
 * already require, and a shift's name and hours are not sensitive.
 *
 * Time is the factory's (D22): "which shift, on which day" is decided in the factory timezone,
 * never the server's.
 */

import { factoryDateKey, factoryMinuteOfDay } from '@/lib/mis/factory-time';
import { resolveShiftAt, shiftDurationMinutes, timeToMinutes } from '@/lib/mis/shift-window';
import { db } from '@/server/db';

import { requirePermission } from './auth';
import { getFactoryTimezone } from './business-rules';

export type FactoryShiftWindow = {
  id: string;
  name: string;
  /** Minutes-of-day. For an overnight shift `endMinute` is smaller than `startMinute`. */
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  /** The factory date this shift instance STARTED on, `YYYY-MM-DD`. */
  dateKey: string;
  timeZone: string;
};

/** The shift running at `at`, or the default/first active shift when none is; null with no shifts at all. */
export async function getFactoryShiftWindow(at: Date = new Date()): Promise<FactoryShiftWindow | null> {
  await requirePermission('production.read');

  const [shifts, timeZone] = await Promise.all([
    db.misShift.findMany({
      where: { isActive: true },
      select: { id: true, name: true, startTime: true, endTime: true, isDefault: true },
      orderBy: { startTime: 'asc' },
    }),
    getFactoryTimezone(),
  ]);

  const shift = resolveShiftAt(shifts, at, timeZone);
  if (!shift) return null;

  const startMinute = timeToMinutes(shift.startTime);
  const endMinute = timeToMinutes(shift.endTime);

  // An overnight shift that is still running after midnight STARTED on the previous factory
  // day: its "day" is the one it began on, so a 01:00 look at a 22:00–06:00 shift is still
  // yesterday's instance.
  const wraps = endMinute <= startMinute;
  const minute = factoryMinuteOfDay(at, timeZone);
  const key = factoryDateKey(at, timeZone);
  const startedYesterday = wraps && minute < endMinute;

  return {
    id: shift.id,
    name: shift.name,
    startMinute,
    endMinute,
    durationMinutes: shiftDurationMinutes(shift),
    dateKey: startedYesterday ? previousKey(key) : key,
    timeZone,
  };
}

function previousKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
