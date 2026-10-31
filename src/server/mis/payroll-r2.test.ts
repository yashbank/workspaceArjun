/**
 * Round-2 payroll fixes, worked by hand at the wage-world fixture rates: 731.19 a day (WG-DAILY-01),
 * overtime ×2.375, late penalty 0.83 a minute.
 *  - R2-107: gross pay never goes below zero; the late penalty is capped at the month's earnings.
 *  - R2-112: one employee's payslip line is computed from queries scoped to that employee.
 *  - R2-110: the wage ledger CSV carries the same rupee figures as the payroll rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EMP, fakeDb, outcome, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll, calculateEmployeePayroll } = await import('./payroll');
const { buildWageLedgerCsv, wageLedgerRows } = await import('./payroll-ledger');

const rec = (id: string, date: string, status: string, lateMinutes: number | null, otMinutes: number | null, employee: object = EMP) => ({
  id, date: new Date(date), status, lateMinutes, otMinutes, employee, shift: { name: 'Day' },
});
const OTHER = { id: 'e2', name: 'Bala', employeeCode: 'E-002' };

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('R2-107 — gross pay has a zero floor', () => {
  it('a half day with 600 late minutes: penalty 498 > earnings 365.60 → penalty capped to 366, gross 0 (was −132)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'HALF_DAY', 600, 0)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.basicWage).toBe(366); // 0.5 × 731.19 = 365.595
    expect(row.latePenalty).toBe(366); // min(600 × 0.83 = 498, 365.595)
    expect(row.grossPay).toBe(0);
  });

  it('only absences with late minutes: no earnings, so no penalty and gross 0 (was −83)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'ABSENT', 100, 0)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row).toMatchObject({ basicWage: 0, latePenalty: 0, grossPay: 0, totalLateMinutes: 100 });
  });

  it('a penalty smaller than earnings is unchanged: 731.19 − 60 × 0.83 = 681.39 → 681', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 60, 0)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row).toMatchObject({ basicWage: 731, latePenalty: 50, grossPay: 681 });
  });

  it('OT pay counts toward what the penalty may take: 1 h OT (217.07) + 1 day (731.19) − 1500 × 0.83 (1245) → gross 0, penalty 948', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 1500, 60)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.otPay).toBe(217); // (731.19 / 8) × 2.375 = 217.07
    expect(row.latePenalty).toBe(948); // 731.19 + 217.07 = 948.26
    expect(row.grossPay).toBe(0);
  });
});

describe('R2-112 — a single payslip computes only that employee', () => {
  it('scopes the attendance query to the employee and returns only their line', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0), rec('2', '2026-01-05', 'PRESENT', 0, 0, OTHER), rec('3', '2026-01-06', 'PRESENT', 0, 0, OTHER)];
    const row = await calculateEmployeePayroll(EMP.id, 2026, 1);
    expect(state.attendanceWhere.at(-1)).toMatchObject({ employeeId: EMP.id });
    expect(row).toMatchObject({ employeeId: EMP.id, basicWage: 731, grossPay: 731 });
  });

  it('agrees with the full-month figure for the same employee', async () => {
    state.attendance = [rec('1', '2026-01-05', 'HALF_DAY', 60, 30), rec('2', '2026-01-07', 'PRESENT', 0, 90)];
    const full = (await calculateMonthlyPayroll(2026, 1)).find((r) => r.employeeId === EMP.id);
    expect(await calculateEmployeePayroll(EMP.id, 2026, 1)).toEqual(full);
  });

  it('an employee with no line that month is null', async () => {
    state.attendance = [];
    expect(await calculateEmployeePayroll(EMP.id, 2026, 1)).toBeNull();
  });

  it.each(['ADMIN', 'SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'WORKER', 'STORE_GUY'])('%s is refused', async (role) => {
    getMisRole.mockResolvedValue(role);
    expect(await outcome(() => calculateEmployeePayroll(EMP.id, 2026, 1))).toBe('denied');
  });
});

describe('R2-110 — wage ledger export', () => {
  it('lays out every rupee column plus a total row, from the payroll rows', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 60, 0), rec('2', '2026-01-05', 'PRESENT', 0, 0, OTHER), rec('3', '2026-01-06', 'PRESENT', 0, 0, OTHER)];
    const rows = wageLedgerRows(await calculateMonthlyPayroll(2026, 1));
    // R2-324: five deduction columns follow Gross Pay (PF 12% of basic, ESIC 0.75% of gross, PT from 10,000, advances, net).
    expect(rows[0]).toEqual(['Code', 'Employee', 'Pay Type', 'Wage Code', 'Present Days', 'Half Days', 'Late Minutes', 'OT Minutes', 'Basic', 'HRA', 'Allowance', 'OT Pay', 'Bonus', 'Extra Pay', 'Late Penalty', 'Gross Pay', 'PF', 'ESIC', 'PT', 'Advance', 'Net Pay']);
    expect(rows[1]).toEqual(['E-001', 'Asha', 'DAILY', null, 1, 0, 60, 0, 731, 0, 0, 0, 0, 0, 50, 681, 88, 5, 0, 0, 588]);
    expect(rows[2]).toEqual(['E-002', 'Bala', 'DAILY', null, 2, 0, 0, 0, 1462, 0, 0, 0, 0, 0, 0, 1462, 175, 11, 0, 0, 1276]);
    expect(rows[3]).toEqual(['TOTAL', '2 employees', null, null, null, null, null, null, 2193, 0, 0, 0, 0, 0, 50, 2143, 263, 16, 0, 0, 1864]);
  });

  it('builds the CSV, names the month, and audits the export without any money figure', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0)];
    const out = await buildWageLedgerCsv(2026, 1);
    expect(out.filename).toBe('wage-ledger-2026-01.csv');
    expect(out.csv.split('\r\n')[1]).toBe('E-001,Asha,DAILY,,1,0,0,0,731,0,0,0,0,0,0,731,88,5,0,0,638'); // R2-324
    const audit = state.auditRows.find((r) => r.action === 'payrollPeriod.wageLedgerExport');
    expect(audit?.after).toEqual({ year: 2026, month: 1, lines: 1 });
  });

  it('refuses a non-month and every non-Owner role', async () => {
    await expect(buildWageLedgerCsv(2026, 13)).rejects.toThrow(/real month/);
    getMisRole.mockResolvedValue('ADMIN');
    expect(await outcome(() => buildWageLedgerCsv(2026, 1))).toBe('denied');
  });
});
