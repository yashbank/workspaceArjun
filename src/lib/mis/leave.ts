import { addDaysToDateKey } from './factory-time';

/**
 * R2-101/102 — pure leave helpers. A leave is a first day (`date`) and an optional last day
 * (`endDate`, inclusive). Everything here works on `YYYY-MM-DD` keys, never on instants.
 */

export const LEAVE_TYPES = ['CL', 'SL', 'EL', 'LWP', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  CL: 'Casual leave (CL)',
  SL: 'Sick leave (SL)',
  EL: 'Earned leave (EL)',
  LWP: 'Leave without pay (LWP)',
  OTHER: 'Other',
};

export function isLeaveType(value: unknown): value is LeaveType {
  return typeof value === 'string' && (LEAVE_TYPES as readonly string[]).includes(value);
}

export function leaveTypeLabel(value: string | null | undefined): string {
  return isLeaveType(value) ? LEAVE_TYPE_LABEL[value] : LEAVE_TYPE_LABEL.OTHER;
}

/** A leave longer than this is almost certainly a typo in the year. */
export const MAX_LEAVE_DAYS = 62;

const isSunday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay() === 0;

/** Every calendar day from `start` to `end` inclusive. Empty when `end` is before `start`. */
export function expandDateRange(start: string, end: string): string[] {
  if (end < start) return [];
  const keys: string[] = [];
  for (let k = start; k <= end && keys.length <= MAX_LEAVE_DAYS + 1; k = addDaysToDateKey(k, 1)) keys.push(k);
  return keys;
}

/**
 * The days a leave actually covers in the register. A single day is always itself (even a
 * Sunday, as before R2); a multi-day range skips Sundays, the factory's weekly off.
 */
export function leaveWorkingDays(start: string, end: string | null | undefined): string[] {
  const last = end && end > start ? end : start;
  if (last === start) return [start];
  return expandDateRange(start, last).filter((k) => !isSunday(k));
}

export function countLeaveWorkingDays(start: string, end: string | null | undefined): number {
  return leaveWorkingDays(start, end).length;
}

/** Two inclusive ranges share at least one day. `end` of null means a single day. */
export function leaveRangesOverlap(
  a: { start: string; end?: string | null },
  b: { start: string; end?: string | null },
): boolean {
  const aEnd = a.end && a.end > a.start ? a.end : a.start;
  const bEnd = b.end && b.end > b.start ? b.end : b.start;
  return a.start <= bEnd && b.start <= aEnd;
}

/** Why a range cannot be requested, or null when it is fine. */
export function validateLeaveRange(start: string, end: string | null | undefined): string | null {
  if (!end || end === start) return null;
  if (end < start) return 'The last day cannot be before the first day';
  if (expandDateRange(start, end).length > MAX_LEAVE_DAYS) return `A leave can span at most ${MAX_LEAVE_DAYS} days`;
  if (countLeaveWorkingDays(start, end) === 0) return 'That range has no working days (Sundays are off)';
  return null;
}

/**
 * The `where` fragment for "a leave request that covers this stored day": a single-day leave on it, or a range
 * (`date`..`endDate`, inclusive) that contains it. Every per-day leave read uses this, so day 3 of a five-day leave
 * reads as on leave exactly like day 1. (A Sunday inside a range matches too; the factory is off that day anyway.)
 */
export function leaveCoversDayWhere(day: Date) {
  return { date: { lte: day }, OR: [{ endDate: null, date: day }, { endDate: { gte: day } }] };
}
