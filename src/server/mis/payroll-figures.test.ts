/**
 * Phase 14F (F-08) — the payroll arithmetic itself, with every attendance status.
 *
 * `rule-history.test.ts` proves WHICH rate prices a day. This proves the sum: the per-day loop
 * that replaced the old aggregate formula gives the same figures for every status a record can
 * carry — PRESENT, HALF_DAY, ABSENT, LEAVE — including overtime and late minutes recorded on a
 * day that earned no basic pay, and null minutes. All figures are worked by hand at the fixture
 * rates: 731.19 a day (WG-DAILY-01), overtime ×2.375, late penalty 0.83 a minute.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EMP, fakeDb, outcome, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll } = await import('./payroll');
const { getWageRuleHistory } = await import('./business-rules');
const { getWageRateHistory } = await import('./wage-type');

const rec = (id: string, date: string, status: string, lateMinutes: number | null, otMinutes: number | null, employee = EMP) => ({
  id, date: new Date(date), status, lateMinutes, otMinutes, employee, shift: { name: 'Day' },
});

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('calculateMonthlyPayroll — a mix of every status', () => {
  it('prices PRESENT, HALF_DAY, ABSENT and LEAVE correctly, counts them, and rounds each figure once at the end', async () => {
    state.attendance = [
      rec('1', '2026-01-05', 'PRESENT', 0, 0),
      rec('2', '2026-01-06', 'HALF_DAY', 60, 30), // half a day; 30 min OT; 60 min late
      rec('3', '2026-01-07', 'ABSENT', 0, 60), // earns nothing, but 60 min of overtime was recorded on it
      rec('4', '2026-01-08', 'LEAVE', null, null), // null minutes count as zero
      rec('5', '2026-01-09', 'PRESENT', null, null),
    ];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row).toMatchObject({
      workingDays: 31,
      present: 3, // PRESENT + HALF_DAY + PRESENT
      halfDay: 1,
      absent: 1,
      leave: 1,
      totalLateMinutes: 60,
      totalOTMinutes: 90,
      basicWage: 1828, // 731.19 + 0.5 × 731.19 + 731.19 = 1827.975
      otPay: 326, //     1.5 h × (731.19 ÷ 8) × 2.375 = 325.61
      latePenalty: 50, // 60 × 0.83 = 49.8
      grossPay: 2104, // 1827.975 + 325.608 − 49.8 = 2103.78
    });
  });

  it('a month with nobody recorded returns an empty list, not zero-filled rows', async () => {
    state.attendance = [];
    expect(await calculateMonthlyPayroll(2026, 1)).toEqual([]);
  });

  it('each employee is totalled separately', async () => {
    const other = { id: 'e2', name: 'Bala', employeeCode: 'E-002' };
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0), rec('2', '2026-01-05', 'PRESENT', 0, 0, other), rec('3', '2026-01-06', 'PRESENT', 0, 0, other)];
    const rows = await calculateMonthlyPayroll(2026, 1);
    expect(rows.map((r) => [r.employeeName, r.basicWage]).sort()).toEqual([['Asha', 731], ['Bala', 1462]]);
  });

  it('an unrecognised status earns nothing rather than a full day', async () => {
    state.attendance = [rec('1', '2026-01-05', 'SOMETHING_NEW', 0, 0)];
    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(0);
  });
});

describe('the history readers hand payroll only what it needs', () => {
  it('getWageRuleHistory returns one wage rule, oldest first, as { effectiveFrom, ruleValue } only', async () => {
    state.rules.push({ id: 'r-new', ruleKey: 'OT_MULTIPLIER', ruleValue: '3', effectiveFrom: new Date('2026-02-01'), updatedById: 'u9' });
    const history = await getWageRuleHistory('OT_MULTIPLIER');
    expect(history).toEqual([
      { effectiveFrom: new Date('2026-01-01T00:00:00Z'), ruleValue: '2.375' },
      { effectiveFrom: new Date('2026-02-01'), ruleValue: '3' },
    ]);
  });

  it('...and refuses a key that is not a wage rule, even for the Owner — it cannot become a general rule reader', async () => {
    await expect(getWageRuleHistory('AQL_MAJOR_MAX' as never)).rejects.toThrow(/not a wage rule/);
    await expect(getWageRuleHistory('line_clearance.mode' as never)).rejects.toThrow(/not a wage rule/);
  });

  it('getWageRateHistory returns the amounts as plain numbers, oldest first', async () => {
    expect(await getWageRateHistory('WG-DAILY-01')).toEqual([{ effectiveFrom: new Date('2026-01-01T00:00:00Z'), amount: 731.19 }]);
  });

  it.each(['ADMIN', 'SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'WORKER', 'STORE_GUY'])(
    '%s is refused both readers at the server function',
    async (role) => {
      getMisRole.mockResolvedValue(role);
      expect(await outcome(() => getWageRuleHistory('DAILY_WAGE_DEFAULT'))).toBe('denied');
      expect(await outcome(() => getWageRateHistory('WG-DAILY-01'))).toBe('denied');
    },
  );
});
