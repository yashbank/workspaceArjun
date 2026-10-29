import { describe, expect, it } from 'vitest';

import { buildPayrollPolicy, hraAfterRentPolicy, isWeekday, parseBoolRule, parseMinDays, parseWeekday, resolveOtMultiplier, weeklyOffIsPaid } from './payroll-policy';

const row = (ruleValue: string, from = '2020-01-01') => ({ effectiveFrom: new Date(from), ruleValue });

describe('resolveOtMultiplier (R2-228)', () => {
  it('attendance.ot_rate wins over OT_MULTIPLIER', () => expect(resolveOtMultiplier('2', '1.5')).toBe(2));
  it('falls back to OT_MULTIPLIER, then 1.5', () => {
    expect(resolveOtMultiplier(undefined, '2.375')).toBe(2.375);
    expect(resolveOtMultiplier(undefined, undefined)).toBe(1.5);
  });
  it('an unreadable or non-positive ot_rate is skipped, not used', () => {
    expect(resolveOtMultiplier('abc', '2')).toBe(2);
    expect(resolveOtMultiplier('0', '2')).toBe(2);
  });
});

describe('parseWeekday / isWeekday (R2-231)', () => {
  it('reads names and 3-letter forms, any case; default Sunday', () => {
    expect(parseWeekday('FRIDAY')).toBe(5);
    expect(parseWeekday(' mon ')).toBe(1);
    expect(parseWeekday('Saturday')).toBe(6);
    expect(parseWeekday('someday')).toBe(0);
    expect(parseWeekday(undefined)).toBe(0);
  });
  it('matches a UTC date', () => {
    expect(isWeekday(new Date('2026-01-04'), 0)).toBe(true); // Sunday
    expect(isWeekday(new Date('2026-01-02'), 5)).toBe(true); // Friday
    expect(isWeekday(new Date('2026-01-02'), 0)).toBe(false);
  });
});

describe('parseBoolRule', () => {
  it('reads true/false spellings and defaults otherwise', () => {
    expect(parseBoolRule('TRUE', false)).toBe(true);
    expect(parseBoolRule('yes', false)).toBe(true);
    expect(parseBoolRule('false', true)).toBe(false);
    expect(parseBoolRule('0', true)).toBe(false);
    expect(parseBoolRule('maybe', true)).toBe(true);
    expect(parseBoolRule(undefined, false)).toBe(false);
  });
});

describe('weeklyOffIsPaid (sandwich)', () => {
  it('off: always paid', () => expect(weeklyOffIsPaid(false, false, false)).toBe(true));
  it('on: paid only when both neighbours were worked', () => {
    expect(weeklyOffIsPaid(true, true, true)).toBe(true);
    expect(weeklyOffIsPaid(true, true, false)).toBe(false);
    expect(weeklyOffIsPaid(true, false, true)).toBe(false);
  });
});

describe('hraAfterRentPolicy (R2-232)', () => {
  it('no minimum: HRA unchanged', () => expect(hraAfterRentPolicy(2000, 0, 0)).toBe(2000));
  it('meets the minimum: unchanged', () => expect(hraAfterRentPolicy(2000, 20, 20)).toBe(2000));
  it('below the minimum: forfeited entirely', () => expect(hraAfterRentPolicy(2000, 19.5, 20)).toBe(0));
  it('parseMinDays: unset/negative/garbage is no minimum', () => {
    expect(parseMinDays('15')).toBe(15);
    expect(parseMinDays(undefined)).toBe(0);
    expect(parseMinDays('-3')).toBe(0);
    expect(parseMinDays('x')).toBe(0);
  });
});

describe('buildPayrollPolicy', () => {
  const policy = buildPayrollPolicy({
    otRate: [row('3', '2026-02-01')], otMultiplier: [row('2')], weeklyOff: [row('FRIDAY')],
    sandwich: [row('true')], rentMinDays: [row('20')], rentCountHolidays: [],
  });
  it('answers as of the day: ot_rate only from its own effective date', () => {
    expect(policy.otMultiplierOn(new Date('2026-01-31'))).toBe(2);
    expect(policy.otMultiplierOn(new Date('2026-02-01'))).toBe(3);
  });
  it('reads the other rules and defaults an unset one', () => {
    const d = new Date('2026-01-10');
    expect(policy.weeklyOffOn(d)).toBe(5);
    expect(policy.sandwichOn(d)).toBe(true);
    expect(policy.rentMinDaysOn(d)).toBe(20);
    expect(policy.rentCountHolidaysOn(d)).toBe(true);
  });
});
