/**
 * Effective-dated lookup: which row was in force on a given day?
 *
 * Rates in this system are never edited in place — a change ADDS a row with an `effectiveFrom` date
 * (`MisBusinessRule`, `MisWageType`). A number computed for a past period must therefore ask "what
 * was in force ON THAT DAY", never "what is in force now" — the mistake that let a rate change move
 * last month's payroll (F-08, MIS-272, D27).
 *
 * Both sides are DATES (`@db.Date` columns, stored as UTC midnight), so the comparison is on the UTC
 * calendar day and carries no time-of-day and no server timezone.
 *
 * Pure: no Prisma, no React.
 */

const day = (d: Date): number => Math.floor(d.getTime() / 86_400_000);

/** The latest row whose `effectiveFrom` is on or before `asOf`'s day; null if none yet applied. */
export function resolveAsOf<T extends { effectiveFrom: Date }>(rows: readonly T[], asOf: Date): T | null {
  const target = day(asOf);
  let best: T | null = null;
  for (const row of rows) {
    if (day(row.effectiveFrom) > target) continue;
    if (best === null || day(row.effectiveFrom) >= day(best.effectiveFrom)) best = row;
  }
  return best;
}
