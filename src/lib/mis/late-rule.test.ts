import { describe, expect, it } from 'vitest';
import { applyLateGrace, lateGraceFor, parseLateRule } from './late-rule';
import { punchMinutes } from './punch-minutes';

describe('late rule', () => {
  it('unset -> no grace, everyone', () => {
    expect(parseLateRule(null, undefined)).toEqual({ graceMinutes: 0, workers: 'ALL' });
    expect(parseLateRule('abc', 'whatever')).toEqual({ graceMinutes: 0, workers: 'ALL' });
  });
  it('parses grace and workers', () => {
    expect(parseLateRule(' 10 ', 'daily')).toEqual({ graceMinutes: 10, workers: 'DAILY' });
    expect(parseLateRule('5', 'Monthly workers')).toEqual({ graceMinutes: 5, workers: 'MONTHLY' });
  });
  it('exempts workers outside the group', () => {
    const rule = parseLateRule('10', 'DAILY');
    expect(lateGraceFor(rule, 'DAILY')).toBe(10);
    expect(lateGraceFor(rule, 'MONTHLY')).toBeNull();
    expect(lateGraceFor(parseLateRule('10', 'ALL'), 'MONTHLY')).toBe(10);
  });
  it('within grace is 0, beyond counts from shift start', () => {
    expect(applyLateGrace(10, 10)).toBe(0);
    expect(applyLateGrace(11, 10)).toBe(11);
    expect(applyLateGrace(0, 0)).toBe(0);
    expect(applyLateGrace(3, 0)).toBe(3);
    expect(applyLateGrace(99, null)).toBe(0);
  });
  it('punchMinutes uses it (UTC factory, shift 09:00)', () => {
    const shift = { startTime: '09:00', endTime: '17:00' };
    const at = (hm: string) => ({ workDate: '2026-10-05', clockIn: new Date(`2026-10-05T${hm}:00Z`), clockOut: null });
    expect(punchMinutes(at('09:08'), shift, 'UTC').lateMinutes).toBe(8);
    expect(punchMinutes(at('09:08'), shift, 'UTC', 10).lateMinutes).toBe(0);
    expect(punchMinutes(at('09:12'), shift, 'UTC', 10).lateMinutes).toBe(12);
    expect(punchMinutes(at('09:12'), shift, 'UTC', null).lateMinutes).toBe(0);
  });
});

describe('resolveLateGrace', async () => {
  const { resolveLateGrace } = await import('./late-rule');
  it('reads the saved settings', async () => {
    const saved: Record<string, string> = { 'attendance.late_threshold_minutes': '15', 'attendance.late_rule_workers': 'DAILY' };
    const read = async (k: string) => saved[k] ?? null;
    expect(await resolveLateGrace(read, 'DAILY')).toBe(15);
    expect(await resolveLateGrace(read, 'MONTHLY')).toBeNull();
  });
  it('unset or failing read -> no grace, everyone', async () => {
    expect(await resolveLateGrace(async () => null, 'MONTHLY')).toBe(0);
    expect(await resolveLateGrace(async () => { throw new Error('x'); }, 'DAILY')).toBe(0);
  });
});
