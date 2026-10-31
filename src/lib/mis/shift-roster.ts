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

const shiftKey = (d: string, days: number): string => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + days)).toISOString().slice(0, 10);
};

/**
 * R2-337: what is left of an existing roster entry once `incoming` takes over its overlapping days.
 * `head` keeps the days before the new range, `tail` the days after; both empty = the old entry goes.
 * History is kept: only the days the new range claims change hands.
 */
export function cutRosterRange(
  existing: { startDate: Date | string; endDate: Date | string },
  incoming: { startDate: Date | string; endDate: Date | string },
): { head: { startDate: string; endDate: string } | null; tail: { startDate: string; endDate: string } | null } {
  const oldStart = key(existing.startDate);
  const oldEnd = key(existing.endDate);
  const newStart = key(incoming.startDate);
  const newEnd = key(incoming.endDate);
  return {
    head: oldStart < newStart ? { startDate: oldStart, endDate: shiftKey(newStart, -1) } : null,
    tail: oldEnd > newEnd ? { startDate: shiftKey(newEnd, 1), endDate: oldEnd } : null,
  };
}
