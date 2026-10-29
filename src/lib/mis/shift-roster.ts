/**
 * R2-214: rotational shift roster — pure rules. No Prisma, no React.
 *
 * Dates are factory date keys ("YYYY-MM-DD"); a Date is read as its UTC calendar day (how a `@db.Date` column arrives).
 */

export type RosterRow = { id?: string; employeeId?: string; shiftId: string; startDate: Date | string; endDate: Date | string };

const key = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** The shift an employee works on `date`: the roster entry covering it (latest start wins), else their default. */
export function resolveShiftForDate(
  employee: { defaultShiftId?: string | null },
  date: Date | string,
  rosterRows: RosterRow[],
): string | null {
  const day = key(date);
  let best: RosterRow | null = null;
  for (const r of rosterRows) {
    if (key(r.startDate) <= day && day <= key(r.endDate) && (!best || key(r.startDate) > key(best.startDate))) best = r;
  }
  return best ? best.shiftId : (employee.defaultShiftId ?? null);
}

/** True when two inclusive ranges share at least one day. */
export function rosterRangesOverlap(a: { startDate: Date | string; endDate: Date | string }, b: { startDate: Date | string; endDate: Date | string }): boolean {
  return key(a.startDate) <= key(b.endDate) && key(b.startDate) <= key(a.endDate);
}
