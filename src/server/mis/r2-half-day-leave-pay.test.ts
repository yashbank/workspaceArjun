/**
 * R2-167 follow-up — a half-day leave follows the Owner's PAID / UNPAID leave-pay setting for HALF_DAY.
 * The worked half is always paid. UNPAID (the default, so deploying changes no payslip): the leave half
 * is deducted, the day pays 0.5. PAID: the leave half is paid too, the day pays 1.0. A HALF_DAY mark with
 * no approved half-day leave behind it (a hand-marked half day) stays 0.5 whatever the setting. A CLOSED
 * month never moves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMP, fakeDb, seedWorld, state, type Row } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll } = await import('./payroll');
const { closePayrollPeriod } = await import('./payroll-period');
const { getLeavePaySettings, setLeavePay } = await import('./leave-pay');

(fakeDb as Row).userProfile = { findMany: async () => [] };

const rec = (id: string, date: string, status: string) => ({ id, date: new Date(date), status, lateMinutes: 0, otMinutes: 0, employee: EMP, shift: { name: 'Day' } });
const halfLeave = (date: string, status = 'APPROVED'): Row => ({ id: `hl-${date}`, employeeId: EMP.id, date: new Date(date), endDate: null, leaveType: 'HALF_DAY', status });
const pay = async () => (await calculateMonthlyPayroll(2026, 1))[0]!.basicWage;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-15T06:00:00Z'));
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});
afterEach(() => vi.useRealTimers());

describe('half-day leave pay', () => {
  it('default UNPAID: the leave half is deducted (0.5 of 731.19)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'HALF_DAY')];
    state.leaveRequests = [halfLeave('2026-01-05')];
    expect(await pay()).toBe(366);
  });

  it('PAID: the leave half is paid too (a full 731)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'HALF_DAY')];
    state.leaveRequests = [halfLeave('2026-01-05')];
    state.leavePayRules.push({ id: 'r', leaveType: 'HALF_DAY', paid: true, effectiveFrom: new Date('2026-01-01'), createdAt: new Date('2026-01-01T05:00:00Z'), reason: null, changedById: 'u1' });
    expect(await pay()).toBe(731);
  });

  it('PAID does not lift a hand-marked HALF_DAY with no approved half-day leave behind it', async () => {
    state.attendance = [rec('1', '2026-01-05', 'HALF_DAY')];
    state.leavePayRules.push({ id: 'r', leaveType: 'HALF_DAY', paid: true, effectiveFrom: new Date('2026-01-01'), createdAt: new Date('2026-01-01T05:00:00Z'), reason: null, changedById: 'u1' });
    expect(await pay()).toBe(366);
  });

  it('a pending or rejected half-day request does not count', async () => {
    state.attendance = [rec('1', '2026-01-05', 'HALF_DAY')];
    state.leaveRequests = [halfLeave('2026-01-05', 'PENDING')];
    state.leavePayRules.push({ id: 'r', leaveType: 'HALF_DAY', paid: true, effectiveFrom: new Date('2026-01-01'), createdAt: new Date('2026-01-01T05:00:00Z'), reason: null, changedById: 'u1' });
    expect(await pay()).toBe(366);
  });
});

describe('half-day setting', () => {
  it('shows HALF_DAY unpaid by default; the Owner can flip it, audited, and a closed month never moves', async () => {
    state.attendance = [rec('1', '2026-01-05', 'HALF_DAY')];
    state.leaveRequests = [halfLeave('2026-01-05')];
    expect((await getLeavePaySettings()).halfDay).toMatchObject({ leaveType: 'HALF_DAY', paid: false, isDefault: true });
    await closePayrollPeriod(2026, 1);
    expect(await pay()).toBe(366);

    await setLeavePay({ leaveType: 'HALF_DAY', paid: true }); // starts 15 Mar 2026
    const view = await getLeavePaySettings();
    expect(view.halfDay).toMatchObject({ paid: true, isDefault: false, since: '2026-03-15' });
    expect(view.history[0]).toMatchObject({ leaveType: 'HALF_DAY', paid: true });
    expect(state.auditRows.some((r: Row) => r.action === 'leavePay.set')).toBe(true);
    expect(await pay()).toBe(366); // January is closed: frozen snapshot
    await expect(setLeavePay({ leaveType: 'HALF_DAY', paid: true })).rejects.toThrow(/already paid/);
  });
});
