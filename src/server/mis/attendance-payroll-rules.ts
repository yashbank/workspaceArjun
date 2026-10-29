/**
 * Numeric attendance rules and the pure helpers that apply them (R2-210, R2-211, R2-213, R2-215).
 * Pure: no Prisma, no clock. The zone is always passed in, never defaulted (D22).
 *
 * Wages are NOT here and never belong here: this file speaks only in minutes and instants.
 */
import { deriveDays, MAX_SHIFT_SPAN_HOURS, workDateFor, type DerivedDay, type PunchFact } from '@/lib/mis/attendance-day';
import { factoryDateKey, factoryMinuteOfDay } from '@/lib/mis/factory-time';
import { shiftDurationMinutes, timeToMinutes, type ShiftWindow } from '@/lib/mis/shift-window';

const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** R2-210: a clock-in is accepted this many minutes before the shift starts. */
export const PRE_SHIFT_CLOCK_IN_BUFFER_MINUTES = 30;
/** R2-213: an open clock-in older than this can never be closed by a scan; it is auto-closed as MISSING_OUT. */
export const STALE_OPEN_PUNCH_HOURS = MAX_SHIFT_SPAN_HOURS;
/**
 * R2-213: an open clock-in from an EARLIER work day is stale once it is at least this old. The floor keeps
 * a clock-out for overtime that runs just past midnight from being read as a missed one.
 */
export const STALE_PREVIOUS_DAY_MIN_AGE_HOURS = 12;
/** R2-213: the note a day carries when its clock-out never came (no schema column; notes are the existing flag). */
export const MISSING_OUT_NOTE = 'MISSING_OUT:';
export function hasMissingOutNote(notes: string | null | undefined): boolean {
  return !!notes?.includes(MISSING_OUT_NOTE);
}

/** Minutes from `workDate` 00:00 on the factory clock to `at`; may exceed 1440 for a next-morning instant. */
function minutesFromWorkDateStart(at: Date, workDate: string, timeZone: string): number {
  const dayDelta = Math.round((Date.parse(`${factoryDateKey(at, timeZone)}T00:00:00Z`) - Date.parse(`${workDate}T00:00:00Z`)) / 86_400_000);
  return dayDelta * MINUTES_PER_DAY + factoryMinuteOfDay(at, timeZone);
}

const hhmm = (minutes: number): string => {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// R2-210 — when may a person clock in?
// ---------------------------------------------------------------------------

export type ClockInWindowVerdict = { allowed: true } | { allowed: false; message: string };

/** Is the factory minute-of-day `m` inside [start - buffer, end] of a shift that begins on this, the previous or the next day? */
function minuteInClockInWindow(m: number, shift: ShiftWindow): boolean {
  const start = timeToMinutes(shift.startTime);
  const lo = start - PRE_SHIFT_CLOCK_IN_BUFFER_MINUTES;
  const hi = start + shiftDurationMinutes(shift);
  return [-MINUTES_PER_DAY, 0, MINUTES_PER_DAY].some((offset) => m + offset >= lo && m + offset <= hi);
}

function windowLabel(shift: ShiftWindow & { name?: string }): string {
  const from = hhmm(timeToMinutes(shift.startTime) - PRE_SHIFT_CLOCK_IN_BUFFER_MINUTES);
  return `${shift.name ? `${shift.name} shift: ` : ''}${from} to ${shift.endTime}`;
}

/**
 * R2-210: a clock-in is allowed from `shiftStart - 30 min` until the shift ends. With no shifts configured there is
 * nothing to check against, so it is allowed. Pass only the shift(s) the person may be on.
 */
export function checkClockInWindow(at: Date, shifts: Array<ShiftWindow & { name?: string }>, timeZone: string): ClockInWindowVerdict {
  if (shifts.length === 0) return { allowed: true };
  const m = factoryMinuteOfDay(at, timeZone);
  if (shifts.some((s) => minuteInClockInWindow(m, s))) return { allowed: true };
  return {
    allowed: false,
    message: `Clock-in is not allowed at ${hhmm(m)}. It opens ${PRE_SHIFT_CLOCK_IN_BUFFER_MINUTES} minutes before the shift starts (${shifts.map(windowLabel).join('; ')}).`,
  };
}

// ---------------------------------------------------------------------------
// R2-211 / R2-215 — payable minutes and early departure
// ---------------------------------------------------------------------------

type DayTimes = { workDate: string; clockIn: Date | null; clockOut: Date | null };

/** Minutes the person was punched in BEFORE the shift started (0 when on time, late or no shift). */
export function preShiftMinutes(day: DayTimes, shift: ShiftWindow | null | undefined, timeZone: string): number {
  if (!shift || !day.clockIn) return 0;
  return Math.max(0, timeToMinutes(shift.startTime) - minutesFromWorkDateStart(day.clockIn, day.workDate, timeZone));
}

/**
 * R2-211: worked minutes counted from max(clock-in, shift start). The punch itself is untouched; the minutes before
 * the shift are simply not payable, and this never produces overtime. Null until both punches exist.
 * R2-216: `unpaidBreakMinutes` (all break rows beyond the paid lunch, see `unpaidTotalBreakMinutes`) comes off the total.
 */
export function payableWorkedMinutes(day: DayTimes, shift: ShiftWindow | null | undefined, timeZone: string, unpaidBreakMinutes = 0): number | null {
  if (!day.clockIn || !day.clockOut) return null;
  const span = Math.round((day.clockOut.getTime() - day.clockIn.getTime()) / MS_PER_MINUTE);
  return Math.max(0, span - preShiftMinutes(day, shift, timeZone) - Math.max(0, unpaidBreakMinutes));
}

/** R2-215: minutes the clock-out came before the shift's end. 0 when on time, later, still in, or no shift. */
export function earlyDepartureMinutes(day: DayTimes, shift: ShiftWindow | null | undefined, timeZone: string): number {
  if (!shift || !day.clockOut) return 0;
  const end = timeToMinutes(shift.startTime) + shiftDurationMinutes(shift);
  return Math.max(0, end - minutesFromWorkDateStart(day.clockOut, day.workDate, timeZone));
}

// ---------------------------------------------------------------------------
// R2-213 — a clock-in that never got its clock-out
// ---------------------------------------------------------------------------

/**
 * Is this open clock-in too old for `at` to close it? True when it is over 16 h old, or when it belongs to an
 * earlier work day and is at least 12 h old (a night shift's morning clock-out shares its work day, so is not stale).
 * `atShiftId` is the tablet's shift hint for the new scan: by the clock alone a 05:30 scan sits inside the night shift
 * (see `workDateFor`), so without the hint only the 16-hour rule can fire.
 */
export function isStaleOpenIn(openIn: PunchFact, at: Date, atShiftId: string | null | undefined, shifts: Array<ShiftWindow & { id: string }>, timeZone: string): boolean {
  const ageMs = at.getTime() - openIn.punchedAt.getTime();
  if (ageMs > STALE_OPEN_PUNCH_HOURS * MS_PER_HOUR) return true;
  if (ageMs < STALE_PREVIOUS_DAY_MIN_AGE_HOURS * MS_PER_HOUR) return false;
  const inDay = workDateFor(openIn.punchedAt, shifts, timeZone, openIn.shiftId).workDate;
  return inDay !== workDateFor(at, shifts, timeZone, atShiftId).workDate;
}

/** The person's open clock-in just before `at`, if there is one (the latest earlier punch is an IN). */
export function openInBefore(punches: PunchFact[], at: Date): PunchFact | null {
  const earlier = punches.filter((p) => p.punchedAt.getTime() < at.getTime()).sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  const last = earlier[earlier.length - 1];
  return last && last.direction === 'IN' ? last : null;
}

/**
 * Split a person's punches into stretches wherever a clock-in arrives while an older one is stale, so the new
 * IN starts a fresh stretch instead of being absorbed by (or paired with) the forgotten one.
 */
export function splitAtStaleOpens(punches: PunchFact[], shifts: Array<ShiftWindow & { id: string }>, timeZone: string): PunchFact[][] {
  const sorted = [...punches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  const segments: PunchFact[][] = [];
  let open: PunchFact | null = null;
  for (const p of sorted) {
    if (p.direction === 'IN' && open && isStaleOpenIn(open, p.punchedAt, p.shiftId, shifts, timeZone)) {
      segments.push([]);
      open = null;
    }
    if (segments.length === 0) segments.push([]);
    segments[segments.length - 1].push(p);
    if (p.direction === 'OUT') open = null;
    else if (!open) open = p;
  }
  return segments;
}

/** `deriveDays` that honours stale open clock-ins (R2-213). Identical to `deriveDays` when none exist. */
export function deriveDaysSplittingStale(
  punches: PunchFact[],
  shifts: Array<ShiftWindow & { id: string }>,
  timeZone: string,
): Map<string, DerivedDay> {
  const merged = new Map<string, DerivedDay>();
  for (const segment of splitAtStaleOpens(punches, shifts, timeZone)) {
    for (const [key, day] of deriveDays(segment, shifts, timeZone)) merged.set(key, day);
  }
  return merged;
}

/** The note written on the day a stale clock-in is closed without a clock-out. */
export function missingOutNote(workDate: string, closedAtLabel: string): string {
  return `${MISSING_OUT_NOTE} no clock-out was recorded for ${workDate}; closed when a new scan arrived at ${closedAtLabel}.`;
}

// ---------------------------------------------------------------------------
// R2-212 — a supervisor hears about long overtime (no approval gate; OT still flows to payroll)
// ---------------------------------------------------------------------------

/** R2-212: a clock-out that records at least this many OT minutes notifies the Supervisor. Minutes only, never money. */
export const OT_NOTIFY_MIN_MINUTES = 30;

export function shouldNotifyOvertime(otMinutes: number | null | undefined): boolean {
  return (otMinutes ?? 0) >= OT_NOTIFY_MIN_MINUTES;
}

// ---------------------------------------------------------------------------
// R2-217 — Factories Act overtime limits: WARN ONLY, never block a punch or a payroll run
// ---------------------------------------------------------------------------

// These are statutory defaults (Factories Act, 1948: s.51 weekly 48 h, s.54 daily 9 h; the 75 h quarterly OT cap is the
// common state-rule figure). They differ by state and by exemption: the Owner should confirm them before relying on them.
export const MAX_DAILY_WORK_MINUTES = 9 * 60;
export const MAX_WEEKLY_WORK_MINUTES = 48 * 60;
export const MAX_QUARTERLY_OT_MINUTES = 75 * 60;

/** Roles shown the compliance warnings. Wage figures are never part of a flag. */
export const COMPLIANCE_VIEW_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'SUPERVISOR'];
export function canSeeComplianceFlags(role: string | null | undefined): boolean {
  return COMPLIANCE_VIEW_ROLES.includes(role ?? '');
}

export const COMPLIANCE_DAILY_LABEL = 'Exceeds 9h/day';
export const COMPLIANCE_WEEKLY_LABEL = 'Exceeds 48h/week';
export const COMPLIANCE_QUARTERLY_LABEL = 'Exceeds 75h OT/quarter';

export type ComplianceDay = { dateKey: string; workedMinutes: number; otMinutes: number };

export function exceedsDailyLimit(workedMinutes: number): boolean {
  return workedMinutes > MAX_DAILY_WORK_MINUTES;
}
export function exceedsWeeklyLimit(weekMinutes: number): boolean {
  return weekMinutes > MAX_WEEKLY_WORK_MINUTES;
}
export function exceedsQuarterlyOtLimit(quarterOtMinutes: number): boolean {
  return quarterOtMinutes > MAX_QUARTERLY_OT_MINUTES;
}

/** Monday (YYYY-MM-DD) of the week holding `dateKey`. */
export function weekStartKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMonday * 86_400_000).toISOString().slice(0, 10);
}

/** First and last day of the calendar quarter holding `dateKey`. */
export function quarterBounds(dateKey: string): { start: string; end: string } {
  const year = Number(dateKey.slice(0, 4));
  const q = Math.floor((Number(dateKey.slice(5, 7)) - 1) / 3);
  return { start: new Date(Date.UTC(year, q * 3, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(year, q * 3 + 3, 0)).toISOString().slice(0, 10) };
}

/** Worked minutes per Monday-start week. */
export function weeklyWorkedMinutes(days: ComplianceDay[]): Map<string, number> {
  const weeks = new Map<string, number>();
  for (const d of days) weeks.set(weekStartKey(d.dateKey), (weeks.get(weekStartKey(d.dateKey)) ?? 0) + d.workedMinutes);
  return weeks;
}

/**
 * The warnings one person's days earn. `days` may reach before/after the month (a week or quarter spans months);
 * `monthKey` (YYYY-MM) says which daily/weekly breaches are reported, and the quarter's OT is counted up to month end.
 */
export function complianceFlagsFor(days: ComplianceDay[], monthKey: string): string[] {
  const flags: string[] = [];
  const inMonth = (key: string) => key.startsWith(monthKey);
  const dailyCount = days.filter((d) => inMonth(d.dateKey) && exceedsDailyLimit(d.workedMinutes)).length;
  if (dailyCount > 0) flags.push(`${COMPLIANCE_DAILY_LABEL} (${dailyCount} ${dailyCount === 1 ? 'day' : 'days'})`);

  const weekEnd = (start: string) => new Date(Date.parse(`${start}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const weekCount = [...weeklyWorkedMinutes(days)].filter(([start, mins]) => exceedsWeeklyLimit(mins) && (inMonth(start) || inMonth(weekEnd(start)))).length;
  if (weekCount > 0) flags.push(`${COMPLIANCE_WEEKLY_LABEL} (${weekCount} ${weekCount === 1 ? 'week' : 'weeks'})`);

  const { start } = quarterBounds(`${monthKey}-01`);
  const monthLast = new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const quarterOt = days.filter((d) => d.dateKey >= start && d.dateKey <= monthLast).reduce((sum, d) => sum + d.otMinutes, 0);
  if (exceedsQuarterlyOtLimit(quarterOt)) flags.push(COMPLIANCE_QUARTERLY_LABEL);
  return flags;
}
