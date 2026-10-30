/**
 * R2-228 / R2-231 / R2-232 — payroll honours the payroll-policy business rules. Worked by hand:
 * January 2026 has 31 days; a MONTHLY wage of MONTHLY_WAGE/31 per day is read off the first row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DAILY_WAGE, EMP, fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll } = await import('./payroll');

const rec = (id: string, date: string, status: string, ot = 0, employee: object = EMP) => ({
  id, date: new Date(date), status, lateMinutes: 0, otMinutes: ot, employee, shift: { name: 'Day' },
});
const setRule = (ruleKey: string, ruleValue: string) =>
  state.rules.push({ id: `r-${ruleKey}`, ruleKey, ruleValue, valueType: 'string', label: ruleKey, description: null, effectiveFrom: new Date('2020-01-01'), updatedById: null });
const MONTHLY = { id: 'e-m', name: 'Chitra', employeeCode: 'E-010', payType: 'MONTHLY', sundayPaid: true, wageTypeCode: 'WG-MONTHLY-01' };
const wageRow = (extra: object) => ({ id: 'w10', code: 'WG-MONTHLY-01', name: 'Staff', nameHi: null, amount: 31000, unit: 'MONTHLY', otRatePerHour: null, multiplierBasis: 'PER_MONTH', hraAmount: null, allowanceAmount: null, bonusAmount: null, effectiveFrom: new Date('2026-01-01'), isActive: true, deletedAt: null, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('R2-228 — attendance.ot_rate', () => {
  it('wins over OT_MULTIPLIER (fixture 2.375): 60 min at ratio 2 = 731.19/8 × 2 = 182.80 → 183', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 60)];
    setRule('attendance.ot_rate', '2');
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.otPay).toBe(183);
    expect(DAILY_WAGE).toBe(731.19);
  });
  it('unset: OT_MULTIPLIER still applies (217)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 60)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.otPay).toBe(217);
  });
});

describe('R2-231 — weekly off and the sandwich rule', () => {
  beforeEach(() => state.wageTypes.push(wageRow({})));

  it('weekly_off FRIDAY: Fridays are paid, Sundays are not (1000/day)', async () => {
    setRule('attendance.weekly_off', 'FRIDAY');
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, MONTHLY)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.allowanceDays).toBe(5); // Fridays 2, 9, 16, 23, 30
    expect(row.basicWage).toBe(6000); // 1 worked + 5 Fridays
  });

  it('unset: Sundays paid as before (4 Sundays + 1 worked day)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, MONTHLY)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.basicWage).toBe(5000);
  });

  it('R2-236: a DAILY worker with sundayPaid gets the Sundays too (4 Sundays + 1 worked day at the daily wage)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, { ...EMP, payType: 'DAILY', sundayPaid: true })];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.allowanceDays).toBe(4);
    expect(row.basicWage).toBe(Math.round(DAILY_WAGE * 5));
  });

  it('R2-236: a DAILY worker without sundayPaid is unchanged (1 worked day only)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, { ...EMP, payType: 'DAILY', sundayPaid: false })];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.allowanceDays).toBe(0);
    expect(row.basicWage).toBe(Math.round(DAILY_WAGE));
  });

  it('sandwich on: a Sunday is paid only when Saturday and Monday were both worked', async () => {
    setRule('sunday.paid_if_adjacent', 'true');
    // Sun 11 Jan: Sat 10 + Mon 12 worked -> paid. Sun 18: Sat 17 worked, Mon 19 not -> unpaid. Others: no neighbours.
    state.attendance = [
      rec('1', '2026-01-10', 'PRESENT', 0, MONTHLY), rec('2', '2026-01-12', 'PRESENT', 0, MONTHLY),
      rec('3', '2026-01-17', 'PRESENT', 0, MONTHLY),
    ];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    // Sun 4: Sat 3 / Mon 5 not worked -> unpaid. Sun 25: unpaid. Paid: 3 worked + Sun 11.
    expect(row.allowanceDays).toBe(1);
    expect(row.basicWage).toBe(4000);
  });

  it('sandwich on: an ABSENT mark on the Sunday does not get paid either', async () => {
    setRule('sunday.paid_if_adjacent', 'true');
    state.attendance = [rec('1', '2026-01-04', 'ABSENT', 0, MONTHLY)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.basicWage).toBe(0);
  });
});

describe('R2-232 — HRA minimum worked days', () => {
  beforeEach(() => state.wageTypes.push(wageRow({ hraAmount: 2000 })));
  const days = (n: number) => Array.from({ length: n }, (_, i) => rec(String(i), `2026-01-${String(i + 5).padStart(2, '0')}`, 'PRESENT', 0, MONTHLY)).filter((r) => r.date.getUTCDay() !== 0);

  it('unset: HRA paid in full', async () => {
    state.attendance = days(2);
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.hra).toBe(2000);
  });

  it('below the minimum: HRA forfeited', async () => {
    setRule('salary.rent_min_days', '20');
    setRule('salary.rent_count_holidays', 'false');
    state.attendance = days(5);
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.hra).toBe(0);
  });

  it('paid Sundays count when rent_count_holidays is true: 5 worked + 4 Sundays = 9 >= 9', async () => {
    setRule('salary.rent_min_days', '9');
    setRule('salary.rent_count_holidays', 'true');
    state.attendance = [5, 6, 7, 8, 9].map((d) => rec(String(d), `2026-01-0${d}`, 'PRESENT', 0, MONTHLY));
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.hra).toBe(2000);
  });

  it('same month with rent_count_holidays false: 5 < 9, forfeited', async () => {
    setRule('salary.rent_min_days', '9');
    setRule('salary.rent_count_holidays', 'false');
    state.attendance = [5, 6, 7, 8, 9].map((d) => rec(String(d), `2026-01-0${d}`, 'PRESENT', 0, MONTHLY));
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.hra).toBe(0);
  });
});
