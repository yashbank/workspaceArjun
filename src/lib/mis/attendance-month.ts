/**
 * The maths behind D8's attendance month matrix — "payroll is arithmetic somebody has to be able to check".
 *
 * D8's rules, each a function here so it is tested as logic rather than read off a picture:
 *
 * - **The footer is computed from the same cells you can see.** Every count — a row's, and the pool's —
 *   is a tally of `CellState`s, and the identity `slots = workers × days = present + half + absent +
 *   leave + not recorded (+ other)` is checked in code (`identityHolds`) and asserted in tests. An
 *   earlier draft of the phone calendar had a footer that disagreed with its own grid; this is the
 *   bug that line exists to prevent.
 * - **Overtime is a stripe, not a second cell.** A present day with overtime is still a present day
 *   (`PRESENT_OT`), so a row stays one cell per day and attendance can be counted by eye.
 * - **"Not recorded" is its own state.** No attendance row and no approved leave means nobody wrote
 *   anything down — dashed, never a quiet absence (MIS_UI_SPEC §4.4 rule 6: dashed = never recorded,
 *   distinct from a recorded state). Only a recorded `ABSENT` row is absent.
 * - **No weekly off is invented.** There is no weekly-off or working-day setting anywhere, so nothing
 *   here decides a Sunday is "off" or that a month has "26 working days"; the grid is every calendar
 *   day, and the header names only the weekday.
 * - **The working is shown, and nothing is rounded before the subtraction.** Durations are whole
 *   minutes end to end; a figure is only formatted at the last step.
 * - **Days are the factory's (D22)** and attendance dates are `@db.Date` keys, so no server-local
 *   clock is read anywhere in this file.
 *
 * Pure: no Prisma, no React.
 */

import { formatFactoryTime } from './factory-time';
import { shiftDurationMinutes } from './shift-window';

export type CellState = 'PRESENT' | 'PRESENT_OT' | 'HALF' | 'ABSENT' | 'LEAVE' | 'NONE' | 'OTHER';

export const CELL_STATES: readonly CellState[] = ['PRESENT', 'PRESENT_OT', 'HALF', 'ABSENT', 'LEAVE', 'NONE', 'OTHER'];

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `2026-08` if `value` is a month key, else null. */
export function parseMonthKey(value: unknown): string | null {
  return typeof value === 'string' && MONTH_KEY.test(value) ? value : null;
}

/** The month key `delta` months from `key`. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export type ResolvedMonth = { key: string; /** the factory's current month: not finished yet */ running: boolean };

/**
 * Which month to show. Default is the LAST FINISHED month — "payroll runs on finished months;
 * showing a half-empty current month invites someone to export it". The running month is reachable
 * only by asking for it, and is flagged; a month in the future is clamped to the running one.
 */
export function resolveMonth(requested: unknown, todayKey: string): ResolvedMonth {
  const current = todayKey.slice(0, 7);
  const asked = parseMonthKey(requested);
  const key = asked === null ? shiftMonth(current, -1) : asked > current ? current : asked;
  return { key, running: key === current };
}

export type DayColumn = { key: string; day: number; /** S M T W T F S */ weekday: string };

const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Every calendar day of the month, in order. Pure calendar arithmetic — no zone is involved. */
export function daysOfMonth(monthKey: string): DayColumn[] {
  const [y, m] = monthKey.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const day = i + 1;
    return { key: `${monthKey}-${String(day).padStart(2, '0')}`, day, weekday: WEEKDAY_LETTER[new Date(Date.UTC(y, m - 1, day)).getUTCDay()] };
  });
}

/** The date key of an attendance `@db.Date` value (UTC midnight of the date). */
export function dbDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cells and the matrix
// ---------------------------------------------------------------------------

/**
 * What one worker-day is. A recorded attendance row decides it; without one, an APPROVED leave
 * request makes it leave; with neither it is "not recorded" — never absent.
 *
 * `LATE` is a present day (the day summaries treat it so); an unfamiliar status is `OTHER`, kept
 * visible so the identity below still holds rather than a day silently going missing.
 */
export function cellState(row: { status: string; otMinutes: number } | null, onApprovedLeave: boolean): CellState {
  if (!row) return onApprovedLeave ? 'LEAVE' : 'NONE';
  switch (row.status) {
    case 'PRESENT':
    case 'LATE':
      return row.otMinutes > 0 ? 'PRESENT_OT' : 'PRESENT';
    case 'HALF_DAY':
      return 'HALF';
    case 'ABSENT':
      return 'ABSENT';
    case 'LEAVE':
      return 'LEAVE';
    default:
      return 'OTHER';
  }
}

export type MatrixEmployee = { id: string; name: string; code: string; department: string | null };
export type MatrixRecord = { employeeId: string; dateKey: string; status: string; otMinutes: number };
export type MatrixLeave = { employeeId: string; dateKey: string };

export type Counts = { present: number; half: number; absent: number; leave: number; none: number; other: number; otMinutes: number };

const emptyCounts = (): Counts => ({ present: 0, half: 0, absent: 0, leave: 0, none: 0, other: 0, otMinutes: 0 });

export type MatrixRow = { employee: MatrixEmployee; cells: CellState[]; counts: Counts };

export type Matrix = {
  days: DayColumn[];
  rows: MatrixRow[];
  totals: Counts & { workers: number; days: number; slots: number };
  /** present + half + absent + leave + none + other === workers × days. False means a bug, never a fact. */
  identityHolds: boolean;
};

function tally(counts: Counts, state: CellState) {
  if (state === 'PRESENT' || state === 'PRESENT_OT') counts.present += 1;
  else if (state === 'HALF') counts.half += 1;
  else if (state === 'ABSENT') counts.absent += 1;
  else if (state === 'LEAVE') counts.leave += 1;
  else if (state === 'NONE') counts.none += 1;
  else counts.other += 1;
}

export function buildMonthMatrix(
  employees: readonly MatrixEmployee[],
  records: readonly MatrixRecord[],
  leaves: readonly MatrixLeave[],
  monthKey: string,
): Matrix {
  const days = daysOfMonth(monthKey);
  const inMonth = new Set(days.map((d) => d.key));
  const byCell = new Map<string, MatrixRecord>();
  for (const r of records) if (inMonth.has(r.dateKey)) byCell.set(`${r.employeeId}|${r.dateKey}`, r);
  const leaveCells = new Set(leaves.filter((l) => inMonth.has(l.dateKey)).map((l) => `${l.employeeId}|${l.dateKey}`));

  const rows: MatrixRow[] = employees.map((employee) => {
    const counts = emptyCounts();
    const cells = days.map(({ key }) => {
      const cell = `${employee.id}|${key}`;
      const rec = byCell.get(cell) ?? null;
      const state = cellState(rec, leaveCells.has(cell));
      tally(counts, state);
      // Overtime belongs to a day someone worked: an absent or leave row with a stray figure adds none.
      if (rec && (state === 'PRESENT' || state === 'PRESENT_OT' || state === 'HALF')) counts.otMinutes += rec.otMinutes;
      return state;
    });
    return { employee, cells, counts };
  });

  // The pool's figures are the SUM OF THE ROWS, i.e. of the visible cells — never a separate query.
  const totals = { ...emptyCounts(), workers: employees.length, days: days.length, slots: employees.length * days.length };
  for (const { counts } of rows) {
    totals.present += counts.present;
    totals.half += counts.half;
    totals.absent += counts.absent;
    totals.leave += counts.leave;
    totals.none += counts.none;
    totals.other += counts.other;
    totals.otMinutes += counts.otMinutes;
  }
  const identityHolds = totals.present + totals.half + totals.absent + totals.leave + totals.none + totals.other === totals.slots;
  return { days, rows, totals, identityHolds };
}

// ---------------------------------------------------------------------------
// One day's punches — "the working, shown"
// ---------------------------------------------------------------------------

/** Whole minutes as `12 h 03 min` (`9 h`, `45 min`) — exact, never a rounded decimal. */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')} min`;
}

/** Hours to one decimal — for a column of totals only, converted ONCE from whole minutes. */
export function hoursLabel(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export type DayDetailInput = {
  status: string;
  clockIn: Date | null;
  clockOut: Date | null;
  otMinutes: number;
  lateMinutes: number;
  shift: { name: string; startTime: string; endTime: string } | null;
};

export type DayDetail = {
  status: string;
  inLabel: string | null;
  outLabel: string | null;
  /** Out minus in, as two whole minutes on the factory's clock; null while either punch is missing. */
  workedMinutes: number | null;
  shiftName: string | null;
  shiftLabel: string | null;
  shiftMinutes: number | null;
  /** worked − shift, when both are known: what the two punches imply. Never below 0. */
  impliedOtMinutes: number | null;
  /** What is STORED against the day. Overtime is entered separately from the punches (D20). */
  recordedOtMinutes: number;
  lateMinutes: number;
  /** null when there is nothing to compare; false is a fact the screen must say out loud. */
  otAgrees: boolean | null;
};

const wholeMinute = (at: Date) => Math.floor(at.getTime() / 60_000);

export function dayDetail(input: DayDetailInput, timeZone: string): DayDetail {
  const { clockIn, clockOut, shift } = input;
  const workedMinutes = clockIn && clockOut ? wholeMinute(clockOut) - wholeMinute(clockIn) : null;
  const shiftMinutes = shift ? shiftDurationMinutes(shift) : null;
  const impliedOtMinutes = workedMinutes !== null && shiftMinutes !== null ? Math.max(0, workedMinutes - shiftMinutes) : null;
  return {
    status: input.status,
    inLabel: clockIn ? formatFactoryTime(clockIn, timeZone) : null,
    outLabel: clockOut ? formatFactoryTime(clockOut, timeZone) : null,
    workedMinutes: workedMinutes !== null && workedMinutes >= 0 ? workedMinutes : null,
    shiftName: shift?.name ?? null,
    shiftLabel: shift ? `${shift.startTime} – ${shift.endTime}` : null,
    shiftMinutes,
    impliedOtMinutes: workedMinutes !== null && workedMinutes >= 0 ? impliedOtMinutes : null,
    recordedOtMinutes: input.otMinutes,
    lateMinutes: input.lateMinutes,
    otAgrees: workedMinutes !== null && workedMinutes >= 0 && impliedOtMinutes !== null ? impliedOtMinutes === input.otMinutes : null,
  };
}

// ---------------------------------------------------------------------------
// What the screen is handed
// ---------------------------------------------------------------------------

/** One person's month, tallied from that person's own cells. */
export type EmployeeMonth = { present: number; half: number; absent: number; leave: number; none: number; other: number; otMinutes: number; days: number };

export type AttendanceMonthView = {
  monthKey: string;
  /** The factory's current month: not finished, so not payroll-ready. */
  running: boolean;
  prevKey: string;
  /** The month after this one, or null when this is already the running month. */
  nextKey: string | null;
  /** The running month's key, so a screen can always offer a way back to it. */
  currentKey: string;
  days: DayColumn[];
  departments: { id: string; name: string }[];
  departmentId: string | null;
  departmentName: string | null;
  rows: { id: string; name: string; code: string; department: string | null; cells: CellState[]; counts: Counts }[];
  totals: Matrix['totals'];
  identityHolds: boolean;
  /** The person whose month and day the side panels show. Null only when the pool is empty. */
  selected: null | {
    id: string;
    name: string;
    code: string;
    month: EmployeeMonth;
    dayKey: string | null;
    /** The chosen day: the recorded punches, or null when nothing is recorded for it. */
    day: DayDetail | null;
    /** The chosen day's cell state, so the panel can say "not recorded" rather than show blanks. */
    dayState: CellState | null;
  };
  /** May this person go on to payroll? A flag only — no figure travels with it (D24). */
  canPayroll: boolean;
};
