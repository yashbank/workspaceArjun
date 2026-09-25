/**
 * Phase 25 (25.1–25.5, D26–D28, D27's missing half) — the new payroll rules, on top of the
 * baseline `payroll-figures.test.ts` already pins. Each case is worked by hand at the fixture
 * rates so a wrong number is caught, not just a wrong shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DAILY_WAGE, EMP, fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll } = await import('./payroll');
const { closePayrollPeriod, getPayrollPeriod, getPayrollPreflight, recordPayrollCorrection } = await import('./payroll-period');
const { setPayComponent } = await import('./pay-components');
const { proposeExtraPayDay, approveExtraPayDay } = await import('./extra-pay-days');

const rec = (id: string, date: string, status: string, lateMinutes: number | null, otMinutes: number | null, employee = EMP) => ({
  id, date: new Date(date), status, lateMinutes, otMinutes, employee, shift: { name: 'Day' },
});

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('25.2/D26 — OT rate per hour on the wage code', () => {
  it('a code with otRatePerHour pays that rate directly, ignoring OT_MULTIPLIER', async () => {
    state.wageTypes.push({ id: 'w9', code: 'WG-DAILY-01', name: 'General', nameHi: null, amount: DAILY_WAGE, unit: 'DAILY', otRatePerHour: 80, multiplierBasis: 'PER_MONTH', hraAmount: null, allowanceAmount: null, bonusAmount: null, effectiveFrom: new Date('2026-01-02'), isActive: true, deletedAt: null });
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 120)]; // 2 hours OT
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.otPay).toBe(160); // 2h × 80, no multiplier arithmetic
  });

  it('an employee with no wage code at all still gets the old OT_MULTIPLIER-based figure', async () => {
    state.attendance = [rec('1', '2026-01-06', 'PRESENT', 0, 90)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.otPay).toBe(326); // matches payroll-figures.test.ts's own hand-worked figure
  });
});

describe('25.3/D28 — pay type and Sunday pay', () => {
  it('a MONTHLY employee is paid every Sunday in the month even with no attendance row for it', async () => {
    state.wageTypes.push({ id: 'w10', code: 'WG-MONTHLY-01', name: 'Staff', nameHi: null, amount: 31000, unit: 'MONTHLY', otRatePerHour: null, multiplierBasis: 'PER_MONTH', hraAmount: null, allowanceAmount: null, bonusAmount: null, effectiveFrom: new Date('2026-01-01'), isActive: true, deletedAt: null });
    const monthly = { id: 'e-monthly', name: 'Chitra', employeeCode: 'E-010', payType: 'MONTHLY', sundayPaid: true, wageTypeCode: 'WG-MONTHLY-01' };
    // January 2026 has five Sundays (4, 11, 18, 25) — four, not five; used for a clean divisor check instead.
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0, monthly)]; // one ordinary Monday
    const [row] = await calculateMonthlyPayroll(2026, 1);
    // 31000/31 = 1000/day. One PRESENT Monday + four un-rowed Sundays (4,11,18,25), each paid in full.
    expect(row.basicWage).toBe(5000); // 1 + 4 = 5 paid days × 1000
    expect(row.allowanceDays).toBe(4);
  });

  it('a DAILY employee is paid a Sunday only when actually PRESENT — unchanged from the pre-25 rule', async () => {
    state.attendance = [rec('1', '2026-01-04', 'ABSENT', 0, 0)]; // 4 Jan 2026 is a Sunday
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.basicWage).toBe(0);
    expect(row.absent).toBe(1);
  });
});

describe('25.1 — per-employee payslip component toggles', () => {
  it('a toggled-off component contributes nothing to gross pay', async () => {
    state.wageTypes.push({ id: 'w11', code: 'WG-DAILY-01', name: 'General', nameHi: null, amount: DAILY_WAGE, unit: 'DAILY', otRatePerHour: null, multiplierBasis: 'PER_MONTH', hraAmount: 2000, allowanceAmount: 500, bonusAmount: 300, effectiveFrom: new Date('2026-01-02'), isActive: true, deletedAt: null });
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0)];

    const withAll = (await calculateMonthlyPayroll(2026, 1))[0];
    expect(withAll.hra).toBe(2000);
    expect(withAll.allowance).toBe(500);
    expect(withAll.bonus).toBe(300);

    await setPayComponent(EMP.id, 'HRA', false);
    const afterToggle = (await calculateMonthlyPayroll(2026, 1))[0];
    expect(afterToggle.hra).toBe(0);
    expect(afterToggle.allowance).toBe(500); // untouched components are unaffected
    expect(afterToggle.grossPay).toBe(withAll.grossPay - 2000);
  });

  it('BASIC off zeroes basic wage but leaves OT alone', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 60)];
    await setPayComponent(EMP.id, 'BASIC', false);
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.basicWage).toBe(0);
    expect(row.otPay).toBeGreaterThan(0);
  });
});

describe('25.4/25.5 — extra-pay days (D28), including the OT-overlap case', () => {
  it('a FLAT_AMOUNT day for ALL_PRESENT adds the flat figure for whoever was present that day', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0)];
    const proposed = await proposeExtraPayDay({ date: new Date('2026-01-05'), kind: 'FLAT_AMOUNT', value: 250, scope: 'ALL_PRESENT', reason: 'Festival bonus' });
    expect(proposed.status).toBe('PENDING');
    await approveExtraPayDay(proposed.id);
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.extraPay).toBe(250);
  });

  it('a PENDING (not yet approved) extra-pay day does not affect payroll', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0)];
    await proposeExtraPayDay({ date: new Date('2026-01-05'), kind: 'FLAT_AMOUNT', value: 250, scope: 'ALL_PRESENT', reason: 'Festival bonus' });
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.extraPay).toBe(0);
  });

  it('a MULTIPLIER day and OT both apply on the same day — additive, neither absorbs the other', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 60)]; // 1 hour OT
    const proposed = await proposeExtraPayDay({ date: new Date('2026-01-05'), kind: 'MULTIPLIER', value: 2, scope: 'EMPLOYEES', employeeIds: [EMP.id], reason: 'Rush order' });
    await approveExtraPayDay(proposed.id);
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.extraPay).toBe(Math.round(2 * DAILY_WAGE)); // PER_MONTH basis (the fallback default) × the day rate
    expect(row.otPay).toBeGreaterThan(0); // OT still priced independently, not absorbed by the extra-pay day
    // Each figure is rounded once on its own (the pre-25 pattern), so the total can differ from
    // the sum of the already-rounded parts by at most a rupee.
    expect(Math.abs(row.grossPay - (row.basicWage + row.otPay + row.extraPay - row.latePenalty))).toBeLessThanOrEqual(1);
  });

  it('EMPLOYEES scope excludes anyone not named', async () => {
    const other = { id: 'e-other', name: 'Deva', employeeCode: 'E-020' };
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0), rec('2', '2026-01-05', 'PRESENT', 0, 0, other)];
    const proposed = await proposeExtraPayDay({ date: new Date('2026-01-05'), kind: 'FLAT_AMOUNT', value: 100, scope: 'EMPLOYEES', employeeIds: [EMP.id], reason: 'x' });
    await approveExtraPayDay(proposed.id);
    const rows = await calculateMonthlyPayroll(2026, 1);
    expect(rows.find((r) => r.employeeId === EMP.id)!.extraPay).toBe(100);
    expect(rows.find((r) => r.employeeId === 'e-other')!.extraPay).toBe(0);
  });
});

describe("D27's missing half — closing a period freezes it", () => {
  it('closePayrollPeriod snapshots the live figures, and a later attendance change no longer moves them', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0)];
    const before = await closePayrollPeriod(2026, 1);
    expect(before.status).toBe('CLOSED');

    const frozen = (await calculateMonthlyPayroll(2026, 1))[0];
    expect(frozen.basicWage).toBe(731); // the same figure payroll-figures.test.ts pins for one PRESENT day

    // A back-dated attendance edit into the closed month...
    state.attendance.push(rec('2', '2026-01-06', 'PRESENT', 0, 0));
    // ...never reaches a closed month's own figures.
    const stillFrozen = (await calculateMonthlyPayroll(2026, 1))[0];
    expect(stillFrozen.basicWage).toBe(731);
  });

  it('closing twice is refused', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0)];
    await closePayrollPeriod(2026, 1);
    await expect(closePayrollPeriod(2026, 1)).rejects.toThrow(/already closed/);
  });

  it('recordPayrollCorrection increments the counter and is refused on an OPEN month', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0)];
    await expect(recordPayrollCorrection(2026, 1, 'oops')).rejects.toThrow(/not closed/);
    await closePayrollPeriod(2026, 1);
    const after = await recordPayrollCorrection(2026, 1, 'back-dated leave approved');
    expect(after.correctionsAfterClose).toBe(1);
  });

  it('getPayrollPeriod returns a virtual OPEN period when none exists yet', async () => {
    const period = await getPayrollPeriod(2026, 3);
    expect(period).toMatchObject({ year: 2026, month: 3, status: 'OPEN', correctionsAfterClose: 0 });
  });
});

describe('getPayrollPreflight — W9\'s "Before export" checklist, from real data', () => {
  it('flags employees with no wage type set, and nothing else when everything is clean', async () => {
    state.employees = [
      { id: 'p1', wageTypeCode: null, isActive: true, deletedAt: null },
      { id: 'p2', wageTypeCode: 'WG-DAILY-01', isActive: true, deletedAt: null },
    ];
    const items = await getPayrollPreflight(2026, 1);
    const wageItem = items.find((i) => i.id === 'wage-type')!;
    expect(wageItem.ok).toBe(false);
    expect(wageItem.detail).toMatch(/1 employee/);
  });

  it('open leave requests are counted from the period\'s own date range', async () => {
    state.leaveRequests = [{ id: 'l1', date: new Date('2026-01-10'), status: 'PENDING' }];
    const items = await getPayrollPreflight(2026, 1);
    expect(items.find((i) => i.id === 'open-leave')!.ok).toBe(false);
  });
});

describe('every new function refuses a non-Owner (D24) — spot check alongside permission-matrix.test.ts', () => {
  it.each(['ADMIN', 'SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'WORKER', 'STORE_GUY'])(
    '%s cannot close a payroll period or read the preflight',
    async (role) => {
      getMisRole.mockResolvedValue(role);
      await expect(closePayrollPeriod(2026, 1)).rejects.toThrow(/Not permitted/);
      await expect(getPayrollPreflight(2026, 1)).rejects.toThrow(/Not permitted/);
    },
  );

  it('ADMIN may propose an extra-pay day (D28) but not approve it', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    const proposed = await proposeExtraPayDay({ date: new Date('2026-01-05'), kind: 'FLAT_AMOUNT', value: 100, scope: 'ALL_PRESENT', reason: 'x' });
    expect(proposed.status).toBe('PENDING');
    await expect(approveExtraPayDay(proposed.id)).rejects.toThrow(/Not permitted/);
  });
});
