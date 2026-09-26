import { describe, expect, it } from 'vitest';

import { daysInMonth, extraPayMultiplierUnit, isSunday, otPayForDay, perDayRate, type WageRowForCalc } from './pay-basis';

describe('isSunday', () => {
  it('is true only for Sundays, in UTC', () => {
    expect(isSunday(new Date(Date.UTC(2026, 8, 20)))).toBe(true); // 20 Sep 2026 is a Sunday
    expect(isSunday(new Date(Date.UTC(2026, 8, 21)))).toBe(false); // Monday
  });
});

describe('daysInMonth', () => {
  it('handles a leap February and a 31-day month', () => {
    expect(daysInMonth(2028, 2)).toBe(29); // 2028 is a leap year
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 1)).toBe(31);
  });
});

const monthlyRow = (amount: number): WageRowForCalc => ({
  amount, unit: 'MONTHLY', otRatePerHour: null, multiplierBasis: 'PER_MONTH',
  hraAmount: null, allowanceAmount: null, bonusAmount: null,
});
const dailyRow = (amount: number, extra: Partial<WageRowForCalc> = {}): WageRowForCalc => ({
  amount, unit: 'DAILY', otRatePerHour: null, multiplierBasis: 'PER_MONTH',
  hraAmount: null, allowanceAmount: null, bonusAmount: null, ...extra,
});

describe('perDayRate', () => {
  it('a DAILY code is already the day rate', () => {
    expect(perDayRate(dailyRow(500), 0, 2026, 9)).toBe(500);
  });
  it('a MONTHLY code divides evenly by that month\'s own day count', () => {
    expect(perDayRate(monthlyRow(31000), 0, 2026, 1)).toBe(1000); // 31 days
    expect(perDayRate(monthlyRow(28000), 0, 2026, 2)).toBe(1000); // 28 days — same total, no discount
  });
  it('no row at all falls back to the caller-supplied default', () => {
    expect(perDayRate(null, 500, 2026, 9)).toBe(500);
  });
});

describe('otPayForDay — D26', () => {
  it('a code with its own otRatePerHour pays that rate directly, no multiplier', () => {
    const row = dailyRow(500, { otRatePerHour: 80 });
    expect(otPayForDay(120, 500, row.otRatePerHour, 1.5)).toBe(160); // 2 hours * 80
  });
  it('a code (or employee) with no otRatePerHour falls back to the pre-D26 multiplier shape', () => {
    expect(otPayForDay(60, 800, null, 1.5)).toBeCloseTo((800 / 8) * 1.5, 5); // 1 hour
  });
});

describe('extraPayMultiplierUnit — D28/25.5', () => {
  it('a MONTHLY employee always multiplies their day rate — no basis to choose', () => {
    expect(extraPayMultiplierUnit('MONTHLY', 1000, 'PER_HOUR')).toBe(1000);
    expect(extraPayMultiplierUnit('MONTHLY', 1000, 'PER_MONTH')).toBe(1000);
  });
  it('a DAILY employee on a PER_MONTH-basis code multiplies the day rate', () => {
    expect(extraPayMultiplierUnit('DAILY', 500, 'PER_MONTH')).toBe(500);
  });
  it('a DAILY employee on a PER_HOUR-basis code multiplies the hour-equivalent rate', () => {
    expect(extraPayMultiplierUnit('DAILY', 800, 'PER_HOUR')).toBe(100); // 800/8
  });
});
