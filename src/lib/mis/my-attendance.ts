/**
 * R2-172 — pure summary of ONE person's month of attendance rows, for the worker's own view.
 * A PRESENT day is 1, a HALF_DAY is 0.5; LEAVE and ABSENT are 0. No money is involved anywhere here.
 */

export type MyDay = { dateKey: string; status: string; clockIn: Date | null; clockOut: Date | null; lateMinutes: number; otMinutes: number };

export type MySummary = { daysWorked: number; absent: number; leave: number; lateMinutes: number; otMinutes: number };

export function summariseMyMonth(days: readonly MyDay[]): MySummary {
  let daysWorked = 0;
  let absent = 0;
  let leave = 0;
  let lateMinutes = 0;
  let otMinutes = 0;
  for (const d of days) {
    if (d.status === 'PRESENT' || d.status === 'LATE') daysWorked += 1;
    else if (d.status === 'HALF_DAY') daysWorked += 0.5;
    else if (d.status === 'ABSENT') absent += 1;
    else if (d.status === 'LEAVE') leave += 1;
    lateMinutes += d.lateMinutes;
    otMinutes += d.otMinutes;
  }
  return { daysWorked, absent, leave, lateMinutes, otMinutes };
}
