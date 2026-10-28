/**
 * R2-175 — the Owner reopens a CLOSED month with a reason. Everything that depended on the frozen state follows:
 * payroll reads live again, a re-close freezes the corrected figures, sent payslips are withdrawn, and the audit row
 * carries the reason and counts but no money.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMP, fakeDb, findLeaks, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const released: { employeeId: string; year: number; month: number }[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the shared fake db has no payslip table; this test adds one
(fakeDb as any).misPayslipRelease = {
  deleteMany: async ({ where }: { where: { year: number; month: number } }) => {
    const keep = released.filter((r) => !(r.year === where.year && r.month === where.month));
    const count = released.length - keep.length;
    released.length = 0;
    released.push(...keep);
    return { count };
  },
};

const { calculateMonthlyPayroll } = await import('./payroll');
const { closePayrollPeriod, reopenPayrollPeriod, getPayrollPeriod } = await import('./payroll-period');

const rec = (id: string, date: string) => ({ id, date: new Date(date), status: 'PRESENT', lateMinutes: 0, otMinutes: 0, employee: EMP, shift: { name: 'Day' } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-15T06:00:00Z'));
  seedWorld();
  released.length = 0;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  state.attendance = [rec('1', '2026-01-05')];
});
afterEach(() => vi.useRealTimers());

describe('reopenPayrollPeriod', () => {
  it('unfreezes the month: live figures return, and a re-close freezes the corrected ones', async () => {
    await closePayrollPeriod(2026, 1);
    state.attendance.push(rec('2', '2026-01-06')); // a correction found after close
    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(731); // still frozen

    const reopened = await reopenPayrollPeriod(2026, 1, 'a day was missed');
    expect(reopened).toMatchObject({ status: 'OPEN', closedById: null, closedAt: null });
    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(1462); // live: 2 days

    await closePayrollPeriod(2026, 1);
    state.attendance.push(rec('3', '2026-01-07'));
    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(1462); // frozen again at the corrected figure
  });

  it('withdraws payslips already sent for that month only, and audits reason + counts without money', async () => {
    await closePayrollPeriod(2026, 1);
    released.push({ employeeId: 'e1', year: 2026, month: 1 }, { employeeId: 'e1', year: 2025, month: 12 });
    await reopenPayrollPeriod(2026, 1, 'bank details wrong');
    expect(released).toEqual([{ employeeId: 'e1', year: 2025, month: 12 }]);
    const row = state.auditRows.find((r) => r.action === 'payrollPeriod.reopen');
    expect(row).toMatchObject({ before: { status: 'CLOSED' }, after: { status: 'OPEN', reason: 'bank details wrong', withdrawnPayslips: 1 } });
    expect(findLeaks(row, { keys: /amount|rate|wage$|gross|pay$/i, values: ['731', '731.19'] })).toEqual([]);
  });

  it('keeps the corrections counter, refuses without a reason, on an OPEN month, and for anyone but the Owner', async () => {
    await closePayrollPeriod(2026, 1);
    state.payrollPeriods[0].correctionsAfterClose = 2;
    await expect(reopenPayrollPeriod(2026, 1, '  ')).rejects.toThrow('A reason is required');
    getMisRole.mockResolvedValue('ADMIN');
    await expect(reopenPayrollPeriod(2026, 1, 'why not')).rejects.toThrow(/Not permitted/);
    getMisRole.mockResolvedValue('OWNER');
    await reopenPayrollPeriod(2026, 1, 'fix');
    expect((await getPayrollPeriod(2026, 1)).correctionsAfterClose).toBe(2);
    await expect(reopenPayrollPeriod(2026, 1, 'again')).rejects.toThrow('not closed');
  });
});
