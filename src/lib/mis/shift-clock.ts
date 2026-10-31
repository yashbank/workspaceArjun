/**
 * R2-372: wall-clock arithmetic for the attendance edit forms. Pure: no Prisma, no React.
 *
 * Deliberately NOT a change to `workDateFor` (attendance-day.ts), which must stay formula-identical with the
 * Android `WorkDate.kt`; this only turns "clock in + shift length" into an "HH:MM" that wraps past midnight.
 */
import { shiftDurationMinutes, timeToMinutes, type ShiftWindow } from './shift-window';

const MINUTES_PER_DAY = 24 * 60;

/** `"22:30"` + 480 → `"06:30"`; never "30:30" or a negative hour. */
export function addMinutesToTime(hhmm: string, minutes: number): string {
  const total = (((timeToMinutes(hhmm) + Math.round(minutes)) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The clock-out a form should offer: the clock-in plus the shift's length when a clock-in is typed (R2-370),
 * else the shift's own end (R2-369/371). Always editable by the person; the server never derives it.
 */
export function expectedClockOut(shift: ShiftWindow, clockIn?: string | null): string {
  return clockIn && /^\d{2}:\d{2}$/.test(clockIn) ? addMinutesToTime(clockIn, shiftDurationMinutes(shift)) : shift.endTime;
}
