/**
 * Payroll policy read from the business rules (R2-228, R2-231, R2-232).
 *
 * The Settings screen saves five payroll-policy rules; this file turns their stored text into the
 * decisions payroll makes. Every helper is pure and every default is the pre-setting behaviour, so a
 * rule nobody has set changes nothing.
 *
 *  - `attendance.ot_rate`           the overtime multiplier. WINS over the older `OT_MULTIPLIER` when set;
 *                                   `OT_MULTIPLIER` stays the fallback (then 1.5). One resolved number.
 *  - `attendance.weekly_off`        weekday name of the paid day off. Default SUNDAY.
 *  - `sunday.paid_if_adjacent`      true = the weekly off is paid only when the day before AND the day
 *                                   after were worked. Default false (always paid).
 *  - `salary.rent_min_days`         worked days needed to keep HRA. Unset/0 = no minimum.
 *  - `salary.rent_count_holidays`   true = paid weekly offs count as worked days for that minimum. Default true.
 *
 * Pure: no Prisma, no React.
 */
import { resolveAsOf } from './effective-dated';
import { deductionPolicyFrom, type DeductionPolicy } from './payroll-deductions';

export type RuleHistory = readonly { effectiveFrom: Date; ruleValue: string }[];

export const DEFAULT_OT_MULTIPLIER = 1.5;
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

/** A stored true/false ("true", "Yes", "1", "on" ...); anything else is the default. */
export function parseBoolRule(raw: string | null | undefined, fallback: boolean): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'on'].includes(v)) return true;
  if (['false', 'no', 'n', '0', 'off'].includes(v)) return false;
  return fallback;
}

/** A weekday name ("friday", "FRI") as 0 (Sunday) to 6 (Saturday); anything else is Sunday. */
export function parseWeekday(raw: string | null | undefined): number {
  const v = (raw ?? '').trim().toUpperCase();
  if (v.length < 3) return 0;
  const i = WEEKDAYS.findIndex((name) => name === v || name.slice(0, 3) === v);
  return i === -1 ? 0 : i;
}

/** The overtime multiplier: `attendance.ot_rate` if it is a positive number, else `OT_MULTIPLIER`, else 1.5. */
export function resolveOtMultiplier(otRate: string | null | undefined, legacy: string | null | undefined): number {
  for (const raw of [otRate, legacy]) {
    const n = Number.parseFloat(raw ?? '');
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_OT_MULTIPLIER;
}

/** A whole-number minimum of days; unset, negative or unreadable means no minimum (0). */
export function parseMinDays(raw: string | null | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** True when `date` falls on `weekday` (0 = Sunday). */
export function isWeekday(date: Date, weekday: number): boolean {
  return date.getUTCDay() === weekday;
}

/** The sandwich rule: with it on, the weekly off is paid only when the day before and the day after were worked. */
export function weeklyOffIsPaid(sandwich: boolean, dayBeforeWorked: boolean, dayAfterWorked: boolean): boolean {
  return !sandwich || (dayBeforeWorked && dayAfterWorked);
}

/**
 * The HRA policy, in one place. Today: below the minimum, HRA is forfeited entirely.
 * To prorate instead, return `hra * Math.min(1, workedDays / minDays)` here — nothing else changes.
 */
export function hraAfterRentPolicy(hra: number, workedDays: number, minDays: number): number {
  if (minDays <= 0 || workedDays >= minDays) return hra;
  return 0;
}

/** The policy payroll asks, each answer as of a date. */
export type PayrollPolicy = {
  otMultiplierOn: (date: Date) => number;
  weeklyOffOn: (date: Date) => number;
  sandwichOn: (date: Date) => boolean;
  rentMinDaysOn: (date: Date) => number;
  rentCountHolidaysOn: (date: Date) => boolean;
  /** R2-324: PF / ESIC / PT rules as of a date (defaults when unset). */
  deductionsOn: (date: Date) => DeductionPolicy;
};

export type PayrollPolicyHistories = {
  otRate: RuleHistory;
  otMultiplier: RuleHistory;
  weeklyOff: RuleHistory;
  sandwich: RuleHistory;
  rentMinDays: RuleHistory;
  rentCountHolidays: RuleHistory;
  /** R2-324: optional so older callers and fixtures keep the defaults. */
  pfPercent?: RuleHistory;
  esicPercent?: RuleHistory;
  esicCeiling?: RuleHistory;
  ptMonthly?: RuleHistory;
  ptMinGross?: RuleHistory;
};

/** Binds the rule histories to "as of this day" lookups (a rate change never moves a past day). */
export function buildPayrollPolicy(h: PayrollPolicyHistories): PayrollPolicy {
  const at = (rows: RuleHistory, date: Date) => resolveAsOf(rows, date)?.ruleValue;
  return {
    otMultiplierOn: (d) => resolveOtMultiplier(at(h.otRate, d), at(h.otMultiplier, d)),
    weeklyOffOn: (d) => parseWeekday(at(h.weeklyOff, d)),
    sandwichOn: (d) => parseBoolRule(at(h.sandwich, d), false),
    rentMinDaysOn: (d) => parseMinDays(at(h.rentMinDays, d)),
    rentCountHolidaysOn: (d) => parseBoolRule(at(h.rentCountHolidays, d), true),
    deductionsOn: (d) => deductionPolicyFrom({
      pfPercent: at(h.pfPercent ?? [], d), esicPercent: at(h.esicPercent ?? [], d), esicCeiling: at(h.esicCeiling ?? [], d),
      ptMonthly: at(h.ptMonthly ?? [], d), ptMinGross: at(h.ptMinGross ?? [], d),
    }),
  };
}
