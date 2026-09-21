import { describe, expect, it } from 'vitest';

import { MAX_REASON, MAX_VALUE, MIN_REASON, buildRulesLedger, dmy, isDayKey, validateRuleValue, validateSchedule, type RuleRowInput } from './rules-ledger';

const row = (id: string, ruleKey: string, ruleValue: string, from: string, over: Partial<RuleRowInput> = {}): RuleRowInput => ({
  id, ruleKey, ruleValue, valueType: 'number', label: over.label ?? ruleKey, description: null, effectiveFrom: new Date(`${from}T00:00:00Z`), updatedById: 'u1', updatedAt: new Date(`${from}T09:00:00Z`), ...over,
});
const TODAY = '2026-09-07';
const names = new Map([['u1', 'A. Bhaskar']]);
const reasons = new Map([['r3', 'Tightening after the August ink change']]);
const AQL = [
  row('r0', 'qc.aql.major.max', '3.0', '2024-04-01', { updatedById: null }),
  row('r1', 'qc.aql.major.max', '2.5', '2025-04-01'),
  row('r2', 'qc.aql.major.max', '2.0', '2026-07-01'),
  row('r3', 'qc.aql.major.max', '1.5', '2026-10-01'),
];
const build = (rows: RuleRowInput[], asOf = TODAY) => buildRulesLedger(rows, { asOf, todayKey: TODAY, names, reasons });

describe('a change adds a row; the old one keeps its range', () => {
  const h = build(AQL).rules[0].history;

  it('lists newest first with the scheduled row at the top', () => {
    expect(h.map((x) => [x.value, x.status])).toEqual([['1.5', 'scheduled'], ['2.0', 'inforce'], ['2.5', 'superseded'], ['3.0', 'superseded']]);
  });

  it('every superseded row has a range that ends the day before the next one starts — no gap, no overlap', () => {
    expect(h.map((x) => [x.from, x.until])).toEqual([
      ['2026-10-01', null], ['2026-07-01', '2026-09-30'], ['2025-04-01', '2026-06-30'], ['2024-04-01', '2025-03-31'],
    ]);
  });

  it('ranges tile the timeline exactly', () => {
    const asc = [...h].reverse();
    for (let i = 0; i < asc.length - 1; i += 1) expect(Date.parse(`${asc[i].until}T00:00:00Z`) + 86_400_000).toBe(Date.parse(`${asc[i + 1].from}T00:00:00Z`));
  });

  it('a seeded row says it was seeded; a chosen row names who chose it; a reason travels with its row', () => {
    expect(h[3]).toMatchObject({ seeded: true, by: null });
    expect(h[1]).toMatchObject({ seeded: false, by: 'A. Bhaskar', reason: null });
    expect(h[0].reason).toBe('Tightening after the August ink change');
  });

  it('a person id with no profile is unknown (null), not seeded', () => {
    const l = build([row('x', 'k', '1', '2026-01-01', { updatedById: 'ghost' })]).rules[0].history[0];
    expect(l).toMatchObject({ by: null, seeded: false });
  });
});

describe('read as of a date', () => {
  it('shows the value in force ON that day', () => {
    expect(build(AQL, '2026-09-07').rules[0]).toMatchObject({ value: '2.0', from: '2026-07-01' });
    expect(build(AQL, '2026-06-30').rules[0]).toMatchObject({ value: '2.5', from: '2025-04-01' });
    expect(build(AQL, '2024-04-01').rules[0]).toMatchObject({ value: '3.0' });
  });

  it('the day a row starts, it is in force (inclusive); the day before, it is not', () => {
    expect(build(AQL, '2026-10-01').rules[0].value).toBe('1.5');
    expect(build(AQL, '2026-09-30').rules[0].value).toBe('2.0');
  });

  it('before anything started there is no value — not the oldest row', () => {
    expect(build(AQL, '2020-01-01').rules[0]).toMatchObject({ value: null, from: null });
  });

  it('looking at a future day shows the scheduled value but does not change which row is IN FORCE today', () => {
    const r = build(AQL, '2026-11-01').rules[0];
    expect(r.value).toBe('1.5');
    expect(r.history.find((x) => x.status === 'inforce')!.value).toBe('2.0');
  });

  it('a past "as of" never rewrites the history statuses, which are always relative to today', () => {
    expect(build(AQL, '2025-05-01').rules[0].history.map((x) => x.status)).toEqual(['scheduled', 'inforce', 'superseded', 'superseded']);
  });
});

describe('the scheduled change is visible before it lands', () => {
  it('a rule with an upcoming row carries it, and the header counts every scheduled row', () => {
    const l = build([...AQL, row('s', 'k2', '9', '2026-12-01'), row('s0', 'k2', '8', '2026-01-01')]);
    expect(l.rules.find((r) => r.ruleKey === 'qc.aql.major.max')!.scheduled).toEqual({ value: '1.5', from: '2026-10-01' });
    expect(l.rules.find((r) => r.ruleKey === 'k2')!.scheduled).toEqual({ value: '9', from: '2026-12-01' });
    expect(l.scheduledCount).toBe(2);
  });

  it('the header counts scheduled ROWS, not rules: two upcoming rows on one rule are two changes', () => {
    const l = build([...AQL, row('r4', 'qc.aql.major.max', '1.0', '2026-12-01')]);
    expect(l.rules[0].history.filter((h) => h.status === 'scheduled')).toHaveLength(2);
    expect(l.scheduledCount).toBe(2);
    expect(l.rules[0].scheduled).toEqual({ value: '1.5', from: '2026-10-01' }); // the NEXT one to land
  });

  it('a rule with none has none; a row starting TODAY is in force, not scheduled', () => {
    const l = build([row('a', 'k', '1', '2026-01-01'), row('b', 'k', '2', TODAY)]);
    expect(l.rules[0].scheduled).toBeNull();
    expect(l.rules[0].history[0]).toMatchObject({ value: '2', status: 'inforce' });
    expect(l.scheduledCount).toBe(0);
  });
});

describe('the list', () => {
  it('has one entry per rule, sorted by label, carrying the newest label and type', () => {
    const l = build([row('1', 'b.key', '1', '2026-01-01', { label: 'Zebra' }), row('2', 'a.key', '1', '2026-01-01', { label: 'Alpha' }), row('3', 'a.key', '2', '2026-05-01', { label: 'Alpha renamed' })]);
    expect(l.rules.map((r) => r.label)).toEqual(['Alpha renamed', 'Zebra']);
  });

  it('no rows is an empty ledger', () => {
    expect(build([])).toMatchObject({ rules: [], scheduledCount: 0 });
  });
});

describe('validateSchedule — the only write', () => {
  const ok = { ruleKey: 'k', value: '1.5', valueType: 'number', effectiveFrom: '2026-10-01', reason: 'Tightening after the ink change', todayKey: TODAY, existingDays: ['2026-07-01'] };

  it('accepts a good change', () => {
    expect(validateSchedule(ok)).toBeNull();
  });

  it('a reason is required — and blank, spaces or two characters are not one', () => {
    for (const reason of ['', '   ', 'ab']) expect(validateSchedule({ ...ok, reason })).toMatch(/reason is required/);
    expect(validateSchedule({ ...ok, reason: 'x'.repeat(MIN_REASON) })).toBeNull();
  });

  it('a new value is required; a number rule refuses text and negatives, and accepts zero', () => {
    expect(validateSchedule({ ...ok, value: '  ' })).toMatch(/new value is required/);
    expect(validateSchedule({ ...ok, value: 'lots' })).toMatch(/number/);
    expect(validateSchedule({ ...ok, value: '-1' })).toMatch(/number/);
    expect(validateSchedule({ ...ok, value: '0' })).toBeNull();
    expect(validateSchedule({ ...ok, valueType: 'string', value: 'Asia/Kolkata' })).toBeNull();
  });

  it('the start day must be a real calendar day', () => {
    for (const d of ['', 'tomorrow', '2026-02-30', '2026-13-01', '2026-1-1', '01/10/2026']) expect(validateSchedule({ ...ok, effectiveFrom: d })).toMatch(/real date/);
  });

  it('a change cannot start in the past, but may start today', () => {
    expect(validateSchedule({ ...ok, effectiveFrom: '2026-09-06' })).toMatch(/cannot start in the past/);
    expect(validateSchedule({ ...ok, effectiveFrom: TODAY })).toBeNull();
  });

  it('a day that already has a row is refused in words — nothing is edited', () => {
    expect(validateSchedule({ ...ok, effectiveFrom: '2026-07-01', todayKey: '2026-06-01' })).toMatch(/already starts on that day/);
  });

  it('checks in a fixed order: reason first, then value, then day', () => {
    expect(validateSchedule({ ...ok, reason: '', value: '', effectiveFrom: 'x' })).toMatch(/reason/);
    expect(validateSchedule({ ...ok, value: '', effectiveFrom: 'x' })).toMatch(/new value/);
  });
});

describe('validateRuleValue — a value the reader would ignore is never shown as in force', () => {
  it('a plain rule of type number takes a plain decimal — not hex, exponent, sign, comma or spaces inside', () => {
    for (const v of ['0', '1.5', '731.19', '0.0']) expect(validateRuleValue('k', 'number', v)).toBeNull();
    for (const v of ['0x10', '1e3', '-1', '1,5', '1 5', '.5', '5.', 'Infinity', 'lots']) expect(validateRuleValue('k', 'number', v)).toMatch(/number/);
  });

  it('a whole-count rule refuses decimals and values below its floor — zero correction days would silently read as 3', () => {
    expect(validateRuleValue('ATTENDANCE_CORRECTION_DAYS', 'number', '0')).toMatch(/1 or more/);
    expect(validateRuleValue('ATTENDANCE_CORRECTION_DAYS', 'number', '2.5')).toMatch(/whole number/);
    expect(validateRuleValue('ATTENDANCE_CORRECTION_DAYS', 'number', '3')).toBeNull();
    expect(validateRuleValue('AQL_SAMPLE_SIZE', 'number', '1.5')).toMatch(/whole number/);
    expect(validateRuleValue('AQL_SAMPLE_SIZE', 'number', '0x10')).toMatch(/whole number/);
    expect(validateRuleValue('AQL_SAMPLE_SIZE', 'number', '0')).toMatch(/1 or more/);
    expect(validateRuleValue('offline.max_queue_age_hours', 'number', '0')).toMatch(/1 or more/);
    expect(validateRuleValue('line_clearance.max_minutes', 'number', '0')).toMatch(/1 or more/);
  });

  it('a defect ceiling may be zero (no critical defect allowed) but not a fraction', () => {
    expect(validateRuleValue('AQL_CRITICAL_MAX', 'number', '0')).toBeNull();
    expect(validateRuleValue('AQL_MAJOR_MAX', 'number', '2.5')).toMatch(/whole number, zero or more/);
  });

  it('the line-clearance mode must be exactly one of its three words — "shift" would silently read as JOB', () => {
    for (const v of ['JOB', 'SHIFT', 'MINUTES']) expect(validateRuleValue('line_clearance.mode', 'string', v)).toBeNull();
    for (const v of ['shift', 'Job', 'WEEK', '']) expect(validateRuleValue('line_clearance.mode', 'string', v)).not.toBeNull();
  });

  it('a value is capped, and blank is refused', () => {
    expect(validateRuleValue('k', 'string', 'x'.repeat(MAX_VALUE))).toBeNull();
    expect(validateRuleValue('k', 'string', 'x'.repeat(MAX_VALUE + 1))).toMatch(/at most/);
    expect(validateRuleValue('k', 'string', '  ')).toMatch(/required/);
  });

  it('validateSchedule applies the per-key rule, and caps the reason', () => {
    const ok = { ruleKey: 'k', value: '1.5', valueType: 'number', effectiveFrom: '2026-10-01', reason: 'Tightening after the ink change', todayKey: TODAY, existingDays: [] as string[] };
    expect(validateSchedule({ ...ok, ruleKey: 'ATTENDANCE_CORRECTION_DAYS', value: '0' })).toMatch(/1 or more/);
    expect(validateSchedule({ ...ok, reason: 'x'.repeat(MAX_REASON) })).toBeNull();
    expect(validateSchedule({ ...ok, reason: 'x'.repeat(MAX_REASON + 1) })).toMatch(/at most/);
  });
});

describe('days', () => {
  it('isDayKey is strict', () => {
    expect(isDayKey('2026-09-07')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
    for (const v of [null, undefined, 5, ['2026-09-07'], {}]) expect(isDayKey(v)).toBe(false);
  });

  it('dmy writes dd/mm/yyyy', () => {
    expect(dmy('2026-10-01')).toBe('01/10/2026');
  });
});
