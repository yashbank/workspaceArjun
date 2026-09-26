/**
 * Phase 25 (25.2, 25.3, 25.5, D26, D28) — the pure arithmetic payroll needs, extracted so it is
 * tested without a database. Every function here takes a resolved wage-type row (already
 * `resolveAsOf`'d by the caller) or plain numbers; none of it queries or gates.
 *
 * Pure: no Prisma, no React.
 */

export type WageRowForCalc = {
  amount: number;
  unit: 'DAILY' | 'MONTHLY' | 'HOURLY' | 'PIECE_RATE';
  otRatePerHour: number | null;
  multiplierBasis: 'PER_MONTH' | 'PER_HOUR';
  hraAmount: number | null;
  allowanceAmount: number | null;
  bonusAmount: number | null;
};

/** UTC Sunday — attendance dates are `@db.Date` (UTC midnight), so this never drifts with a server timezone (D22). */
export function isSunday(date: Date): boolean {
  return date.getUTCDate() >= 1 && date.getUTCDay() === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The per-DAY rate a wage-type row implies, for a date in `year`/`month`.
 *
 * A DAILY-unit code's `amount` already IS the day rate. A MONTHLY-unit code's `amount` is the
 * whole month's salary — "daily and monthly employees use the same wage-code fields; only the
 * base differs" (25.2) — divided evenly across the month's own day count so a 28-day February and
 * a 31-day month both pay the same monthly figure in total, not a discounted one.
 */
export function perDayRate(row: WageRowForCalc | null, fallbackDailyAmount: number, year: number, month: number): number {
  if (!row) return fallbackDailyAmount;
  if (row.unit === 'MONTHLY') return row.amount / daysInMonth(year, month);
  return row.amount; // DAILY (and HOURLY/PIECE_RATE, out of scope for a day-based payroll — treated as-is)
}

/**
 * OT pay for one day's OT minutes. D26: a code with its own `otRatePerHour` pays that rate
 * directly — no multiplier arithmetic. A code without one (or no code at all) falls back to the
 * pre-D26 shape: the per-hour equivalent of the day rate times the OT_MULTIPLIER rule, so an
 * employee never assigned a code keeps earning what they always did.
 */
export function otPayForDay(otMinutes: number, dayRate: number, otRatePerHour: number | null, otMultiplier: number): number {
  const rate = otRatePerHour ?? (dayRate / 8) * otMultiplier;
  return (otMinutes / 60) * rate;
}

/**
 * The unit an extra-pay MULTIPLIER day's `value` multiplies (D28/25.5).
 *
 * A MONTHLY employee has one figure — their derived day rate — so there is nothing to choose.
 * A DAILY employee's wage code says whether its multiplier reads against the day rate
 * (PER_MONTH basis — "a day's worth") or the hour rate (PER_HOUR basis).
 */
export function extraPayMultiplierUnit(payType: 'MONTHLY' | 'DAILY', dayRate: number, basis: 'PER_MONTH' | 'PER_HOUR'): number {
  if (payType === 'MONTHLY') return dayRate;
  return basis === 'PER_HOUR' ? dayRate / 8 : dayRate;
}
