/**
 * R2-106 — late and overtime minutes, derived from a punch-built day against its shift window.
 * Pure: no Prisma, no clock. The zone is required, never defaulted (D22).
 *
 *  - late = minutes the first clock-in is after the shift's start (0 when on time, early or within the grace).
 *  - OT   = minutes the last clock-out is after the shift's end (0 when on time or early).
 *
 * Both are measured on the FACTORY's wall clock relative to the day the shift started
 * (`workDate`), so a night shift (22:00–06:00) clocked out at 07:30 the next morning is 90 min
 * OT, not a negative number. A side that has not arrived yet (no clock-in / no clock-out) is
 * `null`, meaning "unknown — leave whatever is stored alone", never 0.
 */
import { applyLateGrace } from './late-rule';
import { factoryDateKey, factoryMinuteOfDay } from './factory-time';
import { shiftDurationMinutes, timeToMinutes, type ShiftWindow } from './shift-window';

/**
 * R2-103 × R2-106: a waived day carries this note. Punch re-derivation must keep its `lateMinutes` at
 * whatever the waiver set (0) — a later clock-out would otherwise re-compute the lateness payroll then charges.
 */
export const LATENESS_WAIVED_NOTE = 'Lateness waived:';
export const isLatenessWaived = (notes: string | null | undefined): boolean => !!notes?.includes(LATENESS_WAIVED_NOTE);

export type PunchMinutes ={ lateMinutes: number | null; otMinutes: number | null };

/** Minutes from `workDate` 00:00 (factory clock) to `at` — may exceed 1440 for a next-morning instant. */
function minutesFromWorkDateStart(at: Date, workDate: string, timeZone: string): number {
  const dayKey = factoryDateKey(at, timeZone);
  const dayDelta = Math.round((Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${workDate}T00:00:00Z`)) / 86_400_000);
  return dayDelta * 1440 + factoryMinuteOfDay(at, timeZone);
}

export function punchMinutes(
  day: { workDate: string; clockIn: Date | null; clockOut: Date | null },
  shift: ShiftWindow | null | undefined,
  timeZone: string,
  /** R2-230: grace minutes (0 = none); `null` = the late rule does not apply to this person. See `late-rule.ts`. */
  lateGrace: number | null = 0,
): PunchMinutes {
  if (!shift) return { lateMinutes: null, otMinutes: null };
  const start = timeToMinutes(shift.startTime);
  const end = start + shiftDurationMinutes(shift);
  const lateMinutes = day.clockIn ? applyLateGrace(Math.max(0, minutesFromWorkDateStart(day.clockIn, day.workDate, timeZone) - start), lateGrace) : null;
  const otMinutes = day.clockOut ? Math.max(0, minutesFromWorkDateStart(day.clockOut, day.workDate, timeZone) - end) : null;
  return { lateMinutes, otMinutes };
}
