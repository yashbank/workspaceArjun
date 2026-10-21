/**
 * R2-102 — leave types PAID / UNPAID, end to end through payroll, at the wage-world fixture rates:
 * 731.19 a day (WG-DAILY-01, DAILY basis), a 31000 MONTHLY code (31000 / 31 = 1000 a day in January
 * 2026, Sundays 4, 11, 18, 25 paid), late penalty 0.83 a minute. Every figure is worked by hand.
 *
 * Default: EVERY type unpaid, so deploying R2-102 moves no payslip. Most cases below first seed the
 * Owner's expected choice (CL / SL / EL turned Paid from 1 Jan 2026). A paid leave day earns exactly a present day's
 * value (same code, same basis). A LEAVE mark with no approved request behind it stays unpaid.
 * The Owner alone reads or changes the setting; a CLOSED month never moves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES } from '@/lib/mis/roles';

import { EMP, WAGE_DETECTOR, fakeDb, findLeaks, outcome, seedWorld, state, type Row } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll, calculateEmployeePayroll } = await import('./payroll');
const { closePayrollPeriod } = await import('./payroll-period');
const { getLeavePaySettings, setLeavePay, getLeavePayForMonth } = await import('./leave-pay');

const rec = (id: string, date: string, status: string, lateMinutes = 0, otMinutes = 0, employee: object = EMP) => ({
  id, date: new Date(date), status, lateMinutes, otMinutes, employee, shift: { name: 'Day' },
});
let leaveSeq = 0;
const leave = (leaveType: string, date: string, endDate: string | null = null, employeeId = EMP.id, status = 'APPROVED'): Row => ({
  id: `lv-${++leaveSeq}`, employeeId, date: new Date(date), endDate: endDate ? new Date(endDate) : null, leaveType, status,
});

const MONTHLY = { id: 'e-monthly', name: 'Chitra', employeeCode: 'E-010', payType: 'MONTHLY', sundayPaid: true, wageTypeCode: 'WG-MONTHLY-31K' };
const MONTHLY_CODE = { id: 'w-31k', code: 'WG-MONTHLY-31K', name: 'Staff', nameHi: null, amount: 31000, unit: 'MONTHLY', otRatePerHour: null, multiplierBasis: 'PER_MONTH', hraAmount: null, allowanceAmount: null, bonusAmount: null, effectiveFrom: new Date('2026-01-01'), isActive: true, deletedAt: null };

const NON_OWNER = MIS_ROLES.filter((r) => r !== 'OWNER');

/** The Owner has turned CL / SL / EL to Paid, effective 1 Jan 2026 (LWP / Other stay unpaid). */
const ownerPaysCore = () => {
  for (const t of ['CL', 'SL', 'EL']) {
    state.leavePayRules.push({ id: `seed-${t}`, leaveType: t, paid: true, effectiveFrom: new Date('2026-01-01'), createdAt: new Date('2026-01-01T05:00:00Z'), reason: null, changedById: 'u1' });
  }
};

// The settings screen names who made each change; the shared fixture has no profile table, so this file adds one.
(fakeDb as Row).userProfile = { findMany: async ({ where }: Row) => (where.id.in as string[]).map((id) => ({ id, name: id === 'u1' ? 'Arjun (Owner)' : null })) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-15T06:00:00Z'));
  seedWorld();
  leaveSeq = 0;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});
afterEach(() => vi.useRealTimers());

describe('R2-102 — on deploy (no choice made yet): payroll is exactly as before', () => {
  it.each(['CL', 'SL', 'EL', 'LWP', 'OTHER'])('an approved %s day is unpaid: 731 (the present day only)', async (t) => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT'), rec('2', '2026-01-06', 'LEAVE')];
    state.leaveRequests = [leave(t, '2026-01-06')];
    expect((await calculateMonthlyPayroll(2026, 1))[0]).toMatchObject({ present: 1, leave: 1, basicWage: 731, grossPay: 731 });
  });

  it('a monthly employee: only present days and Sundays are paid', async () => {
    state.wageTypes.push(MONTHLY_CODE);
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 0, 0, MONTHLY), rec('2', '2026-01-06', 'LEAVE', 0, 0, MONTHLY)];
    state.leaveRequests = [leave('CL', '2026-01-06', null, MONTHLY.id)];
    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(5000); // 1 present + 4 Sundays
  });
});

describe('R2-102 — DAILY basis', () => {
  beforeEach(ownerPaysCore);
  it('an approved CL day is paid like a present day: 2 × 731.19 = 1462.38 → 1462', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT'), rec('2', '2026-01-06', 'LEAVE')];
    state.leaveRequests = [leave('CL', '2026-01-06')];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row).toMatchObject({ present: 1, leave: 1, basicWage: 1462, grossPay: 1462 });
  });

  it('an approved LWP day is unpaid by default: 731', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT'), rec('2', '2026-01-06', 'LEAVE')];
    state.leaveRequests = [leave('LWP', '2026-01-06')];
    expect((await calculateMonthlyPayroll(2026, 1))[0]).toMatchObject({ leave: 1, basicWage: 731, grossPay: 731 });
  });

  it('a LEAVE mark with no approved request behind it stays unpaid (pending / rejected do not count)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT'), rec('2', '2026-01-06', 'LEAVE'), rec('3', '2026-01-07', 'LEAVE')];
    state.leaveRequests = [leave('CL', '2026-01-06', null, EMP.id, 'PENDING'), leave('CL', '2026-01-07', null, EMP.id, 'REJECTED')];
    expect((await calculateMonthlyPayroll(2026, 1))[0]).toMatchObject({ leave: 2, basicWage: 731 });
  });

  it("another employee's approved leave does not pay this employee's LEAVE day", async () => {
    state.attendance = [rec('1', '2026-01-06', 'LEAVE')];
    state.leaveRequests = [leave('CL', '2026-01-06', null, 'someone-else')];
    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(0);
  });

  it('a mixed month: PRESENT + HALF_DAY(60 late) + CL + EL + SL-range(2 days) + LWP + OTHER + ABSENT + unbacked LEAVE', async () => {
    state.attendance = [
      rec('1', '2026-01-05', 'PRESENT'),
      rec('2', '2026-01-06', 'HALF_DAY', 60),
      rec('3', '2026-01-07', 'LEAVE'), // CL — paid
      rec('4', '2026-01-08', 'LEAVE'), // EL — paid
      rec('5', '2026-01-09', 'LEAVE'), // SL range 9..10 — paid
      rec('6', '2026-01-10', 'LEAVE'), // SL range — paid
      rec('7', '2026-01-12', 'LEAVE'), // LWP — unpaid
      rec('8', '2026-01-13', 'LEAVE'), // OTHER — unpaid
      rec('9', '2026-01-14', 'ABSENT'),
      rec('10', '2026-01-15', 'LEAVE'), // no request — unpaid
    ];
    state.leaveRequests = [
      leave('CL', '2026-01-07'),
      leave('EL', '2026-01-08'),
      leave('SL', '2026-01-09', '2026-01-10'),
      leave('LWP', '2026-01-12'),
      leave('OTHER', '2026-01-13'),
    ];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    // 731.19 × (1 + 0.5 + 4 paid leave days) = 731.19 × 5.5 = 4021.545 ; penalty 60 × 0.83 = 49.8
    expect(row).toMatchObject({
      present: 2, halfDay: 1, absent: 1, leave: 7,
      basicWage: 4022,
      latePenalty: 50,
      grossPay: 3972, // 4021.545 − 49.8 = 3971.745
    });
  });

  it('the zero floor still holds: 1 present day (3000 late min → 2490 penalty) + 1 CL day = 1462.38 earned → penalty 1462, gross 0', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', 3000), rec('2', '2026-01-06', 'LEAVE')];
    state.leaveRequests = [leave('CL', '2026-01-06')];
    expect((await calculateMonthlyPayroll(2026, 1))[0]).toMatchObject({ basicWage: 1462, latePenalty: 1462, grossPay: 0 });
  });

  it('one payslip agrees with the full month', async () => {
    state.attendance = [rec('1', '2026-01-05', 'PRESENT'), rec('2', '2026-01-06', 'LEAVE')];
    state.leaveRequests = [leave('EL', '2026-01-06')];
    const full = (await calculateMonthlyPayroll(2026, 1))[0];
    expect(await calculateEmployeePayroll(EMP.id, 2026, 1)).toEqual(full);
    expect(full.basicWage).toBe(1462);
  });
});

describe('R2-102 — MONTHLY basis (31000 / 31 = 1000 a day)', () => {
  beforeEach(ownerPaysCore);
  it('1 present day + SL range of 3 days + 1 LWP day + 4 Sundays → (1 + 3 + 4) × 1000 = 8000', async () => {
    state.wageTypes.push(MONTHLY_CODE);
    state.attendance = [
      rec('1', '2026-01-05', 'PRESENT', 0, 0, MONTHLY),
      rec('2', '2026-01-06', 'LEAVE', 0, 0, MONTHLY),
      rec('3', '2026-01-07', 'LEAVE', 0, 0, MONTHLY),
      rec('4', '2026-01-08', 'LEAVE', 0, 0, MONTHLY),
      rec('5', '2026-01-09', 'LEAVE', 0, 0, MONTHLY), // LWP
    ];
    state.leaveRequests = [leave('SL', '2026-01-06', '2026-01-08', MONTHLY.id), leave('LWP', '2026-01-09', null, MONTHLY.id)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row).toMatchObject({ payType: 'MONTHLY', present: 1, leave: 4, allowanceDays: 4, basicWage: 8000, grossPay: 8000 });
  });

  it('a monthly employee on a leave range spanning a Sunday is not paid that Sunday twice', async () => {
    state.wageTypes.push(MONTHLY_CODE);
    // CL 10..12 Jan: approval marks 10 and 12 (11 is a Sunday). Sunday 11 is paid once, as every Sunday.
    state.attendance = [rec('1', '2026-01-10', 'LEAVE', 0, 0, MONTHLY), rec('2', '2026-01-12', 'LEAVE', 0, 0, MONTHLY)];
    state.leaveRequests = [leave('CL', '2026-01-10', '2026-01-12', MONTHLY.id)];
    // 2 paid leave days + 4 Sundays = 6 × 1000
    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(6000);
  });
});

describe('R2-102 — no double pay, half days', () => {
  beforeEach(ownerPaysCore);

  it('a LEAVE day that also has punches (OT) earns ONE day plus the same OT a present day would — never two days', async () => {
    state.attendance = [rec('1', '2026-01-06', 'PRESENT', 0, 120)];
    const asPresent = (await calculateMonthlyPayroll(2026, 1))[0];
    state.attendance = [rec('1', '2026-01-06', 'LEAVE', 0, 120)];
    state.leaveRequests = [leave('CL', '2026-01-06')];
    const asLeave = (await calculateMonthlyPayroll(2026, 1))[0];
    expect(asLeave.basicWage).toBe(731);
    expect(asLeave.otPay).toBe(asPresent.otPay);
    expect(asLeave.grossPay).toBe(asPresent.grossPay);
  });

  it('two approved leaves covering the same day still pay that day once', async () => {
    state.attendance = [rec('1', '2026-01-06', 'LEAVE')];
    state.leaveRequests = [leave('CL', '2026-01-06'), leave('SL', '2026-01-05', '2026-01-07')];
    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(731);
  });

  it('a HALF_DAY inside an approved paid leave stays a half day (0.5) — the leave never tops it up', async () => {
    state.attendance = [rec('1', '2026-01-06', 'HALF_DAY')];
    state.leaveRequests = [leave('CL', '2026-01-06')];
    expect((await calculateMonthlyPayroll(2026, 1))[0]).toMatchObject({ halfDay: 1, leave: 0, basicWage: 366 }); // 365.595
  });

  it('a PRESENT day inside an approved paid leave is paid once, as present', async () => {
    state.attendance = [rec('1', '2026-01-06', 'PRESENT')];
    state.leaveRequests = [leave('CL', '2026-01-06')];
    expect((await calculateMonthlyPayroll(2026, 1))[0]).toMatchObject({ present: 1, leave: 0, basicWage: 731 });
  });
});

describe('R2-102 — the Owner flips a type', () => {
  beforeEach(ownerPaysCore);
  it('CL → unpaid prices the current month at 0 for CL; flipping back the same day pays it again (later change wins)', async () => {
    state.attendance = [rec('1', '2026-03-05', 'PRESENT'), rec('2', '2026-03-06', 'LEAVE')];
    state.leaveRequests = [leave('CL', '2026-03-06')];
    expect((await calculateMonthlyPayroll(2026, 3))[0].basicWage).toBe(1462);

    await setLeavePay({ leaveType: 'CL', paid: false, reason: 'Policy change' }, new Date('2026-03-15T06:00:00Z'));
    expect((await calculateMonthlyPayroll(2026, 3))[0].basicWage).toBe(731);

    await setLeavePay({ leaveType: 'CL', paid: true }, new Date('2026-03-15T07:00:00Z'));
    expect((await calculateMonthlyPayroll(2026, 3))[0].basicWage).toBe(1462);
    expect(state.leavePayRules.filter((r) => !String(r.id).startsWith('seed-'))).toHaveLength(2);
  });

  it('LWP → paid starts paying LWP days', async () => {
    state.attendance = [rec('1', '2026-03-06', 'LEAVE')];
    state.leaveRequests = [leave('LWP', '2026-03-06')];
    expect((await calculateMonthlyPayroll(2026, 3))[0].basicWage).toBe(0);
    await setLeavePay({ leaveType: 'LWP', paid: true });
    expect((await calculateMonthlyPayroll(2026, 3))[0].basicWage).toBe(731);
  });

  it('a CLOSED month never moves, and an earlier OPEN month keeps the choice in force on its own last day', async () => {
    state.attendance = [
      rec('1', '2026-01-06', 'LEAVE'), // January — closed below
      rec('2', '2026-02-10', 'LEAVE'), // February — still open, ended before the change
      rec('3', '2026-03-10', 'LEAVE'), // March — the current month
    ];
    state.leaveRequests = [leave('CL', '2026-01-06'), leave('CL', '2026-02-10'), leave('CL', '2026-03-10')];
    await closePayrollPeriod(2026, 1);
    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(731);

    await setLeavePay({ leaveType: 'CL', paid: false }); // starts 15 Mar 2026 (factory today)

    expect((await calculateMonthlyPayroll(2026, 1))[0].basicWage).toBe(731); // frozen snapshot
    expect((await calculateMonthlyPayroll(2026, 2))[0].basicWage).toBe(731); // 28 Feb < 15 Mar: still paid
    expect((await calculateMonthlyPayroll(2026, 3))[0].basicWage).toBe(0); // the month the change lands in
    expect(await getLeavePayForMonth(2026, 3)).toEqual({ CL: false, SL: true, EL: true, LWP: false, OTHER: false });
  });
});

describe('R2-102 — the setting itself', () => {
  it('shows the defaults until a change is made, then the change and its history', async () => {
    const before = await getLeavePaySettings();
    expect(before.setupPending).toBe(false);
    expect(before.types.map((t) => [t.leaveType, t.paid, t.isDefault])).toEqual([
      ['CL', false, true], ['SL', false, true], ['EL', false, true], ['LWP', false, true], ['OTHER', false, true],
    ]);
    expect(before.history).toEqual([]);

    await setLeavePay({ leaveType: 'SL', paid: true, reason: '  Sick leave paid from now  ' });
    const after = await getLeavePaySettings();
    expect(after.types.find((t) => t.leaveType === 'SL')).toMatchObject({ paid: true, isDefault: false, since: '2026-03-15' });
    expect(after.history).toHaveLength(1);
    expect(after.history[0]).toMatchObject({ leaveType: 'SL', paid: true, effectiveFrom: '2026-03-15', reason: 'Sick leave paid from now', changedBy: 'Arjun (Owner)' });
  });

  it('audits the flag before and after — and no money', async () => {
    await setLeavePay({ leaveType: 'EL', paid: true, reason: 'Board decision' });
    const audit = state.auditRows.find((r) => r.action === 'leavePay.set');
    expect(audit).toMatchObject({
      entity: 'MisLeavePayRule',
      actorId: 'u1',
      before: { leaveType: 'EL', paid: false },
      after: { leaveType: 'EL', paid: true, effectiveFrom: '2026-03-15', reason: 'Board decision' },
    });
    expect(findLeaks(audit, WAGE_DETECTOR())).toEqual([]);
  });

  it('refuses a no-op, an unknown type and a non-boolean, in words, writing nothing', async () => {
    await expect(setLeavePay({ leaveType: 'CL', paid: false })).rejects.toThrow(/already unpaid/);
    await expect(setLeavePay({ leaveType: 'LWP', paid: false })).rejects.toThrow(/already unpaid/);
    await expect(setLeavePay({ leaveType: 'XL', paid: true })).rejects.toThrow(/CL, SL, EL, LWP or Other/);
    await expect(setLeavePay({ leaveType: 'CL', paid: 'no' })).rejects.toThrow(/Paid or Unpaid/);
    await expect(setLeavePay({ leaveType: 'CL', paid: false, reason: 'x'.repeat(201) })).rejects.toThrow(/at most 200/);
    expect(state.leavePayRules).toEqual([]);
    expect(state.auditRows.filter((r) => r.action === 'leavePay.set')).toEqual([]);
  });

  it('before the database update: defaults show, payroll uses them, a save is refused in words', async () => {
    const missing = Object.assign(new Error('relation "mis_leave_pay_rules" does not exist'), { code: 'P2021' });
    const spy = vi.spyOn(fakeDb.misLeavePayRule, 'findMany').mockRejectedValue(missing);
    try {
      const view = await getLeavePaySettings();
      expect(view.setupPending).toBe(true);
      expect(view.types.every((t) => t.isDefault)).toBe(true);
      await expect(setLeavePay({ leaveType: 'CL', paid: false })).rejects.toThrow(/database update/);
      state.attendance = [rec('1', '2026-03-06', 'LEAVE')];
      state.leaveRequests = [leave('CL', '2026-03-06')];
      expect((await calculateMonthlyPayroll(2026, 3))[0].basicWage).toBe(0); // default: unpaid
    } finally {
      spy.mockRestore();
    }
  });

  it('any other database error is NOT swallowed as "no setting"', async () => {
    const spy = vi.spyOn(fakeDb.misLeavePayRule, 'findMany').mockRejectedValue(new Error('connection reset'));
    try {
      await expect(getLeavePaySettings()).rejects.toThrow(/connection reset/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('R2-102 — non-Owners can neither read nor change it (wage-leak style)', () => {
  it('the Owner probe sees the setting (so a denial below is not an empty fixture)', async () => {
    const r = await outcome(() => getLeavePaySettings());
    expect(r).not.toBe('denied');
    expect((r as { value: { types: unknown[] } }).value.types).toHaveLength(5);
  });

  it.each(NON_OWNER)('%s is refused every door and nothing is written', async (role) => {
    getMisRole.mockResolvedValue(role);
    expect(await outcome(() => getLeavePaySettings())).toBe('denied');
    expect(await outcome(() => setLeavePay({ leaveType: 'CL', paid: false }))).toBe('denied');
    expect(await outcome(() => getLeavePayForMonth(2026, 3))).toBe('denied');
    expect(state.leavePayRules).toEqual([]);
    expect(state.auditRows).toEqual([]);
  });

  it('an anonymous caller and a login with no MIS role are refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await outcome(() => getLeavePaySettings())).toBe('denied');
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    getMisRole.mockResolvedValue(null);
    expect(await outcome(() => setLeavePay({ leaveType: 'CL', paid: false }))).toBe('denied');
  });
});
