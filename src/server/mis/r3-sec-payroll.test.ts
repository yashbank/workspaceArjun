/**
 * R3-SEC B43-B48: payroll money and the extra-pay / close rules. Worked by hand at the
 * wage-world fixture rates (daily 731.19, monthly 18734.56).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DAILY_WAGE, EMP, MONTHLY_WAGE, fakeDb, seedWorld, state } from './testing/wage-world';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose fake rows
type Row = Record<string, any>;

// The fake db, with (a) an advisory-lock stand-in: transactions run one at a time, like
// pg_advisory_xact_lock('payroll-close-...') makes them, and (b) a switch to break the period lookup.
let queue: Promise<unknown> = Promise.resolve();
const control: { periodError: Error | null } = { periodError: null };
const dbProxy = {
  ...fakeDb,
  misPayrollPeriod: {
    ...fakeDb.misPayrollPeriod,
    findUnique: async (args: Row) => {
      if (control.periodError) throw control.periodError;
      return fakeDb.misPayrollPeriod.findUnique(args);
    },
  },
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => {
    const run = queue.then(() => fn(dbProxy));
    queue = run.catch(() => undefined);
    return run;
  },
};
vi.mock('@/server/db', () => ({ get db() { return dbProxy; } }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll, getMonthWageBill } = await import('./payroll');
const { closePayrollPeriod } = await import('./payroll-period');
const { proposeExtraPayDay, approveExtraPayDay, rejectExtraPayDay } = await import('./extra-pay-days');

const rec = (id: string, date: string, status: string, employee: Row = EMP) => ({
  id, date: new Date(date), status, lateMinutes: 0, otMinutes: 0, employee, shift: { name: 'Day' },
});
const activeEmployee = (extra: Row = {}) => ({ id: EMP.id, name: EMP.name, employeeCode: EMP.employeeCode, isActive: true, deletedAt: null, wageTypeCode: null, payType: 'DAILY', sundayPaid: false, departmentId: null, ...extra });
const propose = (over: Row = {}) =>
  proposeExtraPayDay({ date: '2026-01-05', kind: 'FLAT_AMOUNT', value: 100, scope: 'ALL_PRESENT', reason: 'x', ...over } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-15T06:00:00Z')); // the factory's 15 March 2026
  seedWorld();
  queue = Promise.resolve();
  control.periodError = null;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});
afterEach(() => vi.useRealTimers());

describe('B43 DEPARTMENTS extra pay', () => {
  it('pays employees in the department and not those outside it', async () => {
    const inD = { id: 'e-in', name: 'In', employeeCode: 'E-1', departmentId: 'dept-D' };
    const outD = { id: 'e-out', name: 'Out', employeeCode: 'E-2', departmentId: 'dept-X' };
    state.attendance = [rec('1', '2026-01-05', 'PRESENT', inD), rec('2', '2026-01-05', 'PRESENT', outD)];
    const day = await propose({ scope: 'DEPARTMENTS', departmentIds: ['dept-D'] });
    await approveExtraPayDay(day.id);
    const rows = await calculateMonthlyPayroll(2026, 1);
    expect(rows.find((r) => r.employeeId === 'e-in')!.extraPay).toBe(100);
    expect(rows.find((r) => r.employeeId === 'e-out')!.extraPay).toBe(0);
  });
});

describe('B44 employees with a wage code but no attendance rows still get a line', () => {
  const monthly = (extra: Row = {}) => activeEmployee({ id: 'e-m', name: 'Chitra', employeeCode: 'E-9', payType: 'MONTHLY', sundayPaid: true, wageTypeCode: 'WG-MONTHLY-01', ...extra });

  it('a MONTHLY employee with no rows in a 4-Sunday month gets 4 Sunday units', async () => {
    state.attendance = [];
    state.employees = [monthly()];
    const rows = await calculateMonthlyPayroll(2026, 1); // Sundays: 4, 11, 18, 25
    expect(rows).toHaveLength(1);
    expect(rows[0].allowanceDays).toBe(4);
    expect(rows[0].basicWage).toBe(Math.round((4 * MONTHLY_WAGE) / 31));
    expect(rows[0].present).toBe(0);
  });

  it('headcount of the wage bill includes them', async () => {
    state.attendance = [];
    state.employees = [monthly()];
    expect((await getMonthWageBill(2026, 1)).headcount).toBe(1);
  });

  it('an employee WITHOUT a wage code, an inactive one and a deleted one are not added', async () => {
    state.attendance = [];
    state.employees = [monthly({ id: 'a', wageTypeCode: null }), monthly({ id: 'b', isActive: false }), monthly({ id: 'c', deletedAt: new Date() })];
    expect(await calculateMonthlyPayroll(2026, 1)).toEqual([]);
  });

  it('an EMPLOYEES-scoped extra-pay day reaches a zero-row employee; a row-carrying employee is not duplicated', async () => {
    state.employees = [monthly(), activeEmployee({ wageTypeCode: 'WG-DAILY-01' })];
    state.attendance = [rec('1', '2026-01-05', 'PRESENT')]; // EMP has a row
    const day = await propose({ scope: 'EMPLOYEES', employeeIds: ['e-m'] });
    state.employees = [monthly(), activeEmployee({ wageTypeCode: 'WG-DAILY-01' })];
    await approveExtraPayDay(day.id);
    const rows = await calculateMonthlyPayroll(2026, 1);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.employeeId === 'e-m')!.extraPay).toBe(100);
    expect(rows.find((r) => r.employeeId === EMP.id)!.basicWage).toBe(Math.round(DAILY_WAGE));
  });
});

describe('B45 ALL_PRESENT pays by attendance fraction; the date is normalised', () => {
  it('a HALF_DAY with a flat 500 gets 250, a PRESENT gets 500', async () => {
    const half = { id: 'e-half', name: 'Half', employeeCode: 'E-3' };
    state.attendance = [rec('1', '2026-01-05', 'PRESENT'), rec('2', '2026-01-05', 'HALF_DAY', half)];
    const day = await propose({ value: 500 });
    await approveExtraPayDay(day.id);
    const rows = await calculateMonthlyPayroll(2026, 1);
    expect(rows.find((r) => r.employeeId === EMP.id)!.extraPay).toBe(500);
    expect(rows.find((r) => r.employeeId === 'e-half')!.extraPay).toBe(250);
  });

  it.each(['13/10/2026', '2026-1-5', 'tomorrow', ''])('the input %j is refused', async (date) => {
    await expect(propose({ date })).rejects.toThrow(/YYYY-MM-DD/);
  });

  it('an impossible calendar day is refused; an instant is read as the FACTORY day', async () => {
    await expect(propose({ date: '2026-02-30' })).rejects.toThrow(/real calendar day/);
    // 20:00Z on 4 Jan is 01:30 IST on 5 Jan: the factory's day is the 5th.
    const row = await propose({ date: new Date('2026-01-04T20:00:00Z') });
    expect(row.date.toISOString().slice(0, 10)).toBe('2026-01-05');
  });
});

describe('B46 closePayrollPeriod', () => {
  it('month 13, month 0 and a silly year are refused', async () => {
    await expect(closePayrollPeriod(2026, 13)).rejects.toThrow(/between 1 and 12/);
    await expect(closePayrollPeriod(2026, 0)).rejects.toThrow(/between 1 and 12/);
    await expect(closePayrollPeriod(1999, 1)).rejects.toThrow(/between 2000 and 2100/);
    await expect(closePayrollPeriod(2101, 1)).rejects.toThrow(/between 2000 and 2100/);
  });

  it('the current and a future factory month are refused; a past month closes', async () => {
    await expect(closePayrollPeriod(2026, 3)).rejects.toThrow(/current or a future month/);
    await expect(closePayrollPeriod(2026, 4)).rejects.toThrow(/current or a future month/);
    await expect(closePayrollPeriod(2027, 1)).rejects.toThrow(/current or a future month/);
    await expect(closePayrollPeriod(2026, 2)).resolves.toMatchObject({ status: 'CLOSED' });
  });

  it('preflight blockers refuse the close; an Owner override with a reason of 3+ chars passes and is audited without money', async () => {
    state.leaveRequests = [{ id: 'l1', date: new Date('2026-01-10'), status: 'PENDING' }];
    await expect(closePayrollPeriod(2026, 1)).rejects.toThrow(/Fix first/);
    await expect(closePayrollPeriod(2026, 1, { reason: 'ok' })).rejects.toThrow(/Fix first/);
    await expect(closePayrollPeriod(2026, 1, { reason: 'owner reviewed' })).resolves.toMatchObject({ status: 'CLOSED' });
    const closed = state.auditRows.find((r) => r.action === 'payrollPeriod.close')!;
    expect(closed.after).toMatchObject({ overrideReason: 'owner reviewed', overriddenChecks: ['open-leave'] });
    expect(JSON.stringify(closed)).not.toMatch(/wage|salary|gross|amount|\d{3,}\.\d/i);
  });

  it('two concurrent closes: one succeeds, the other is told it is already closed', async () => {
    // seed the timezone rule so the two closes do not race on its create-if-missing
    state.rules.push({ id: 'tz', ruleKey: 'factory.timezone', ruleValue: 'Asia/Kolkata', valueType: 'string', label: 'tz', description: null, effectiveFrom: new Date('2026-01-01'), updatedById: null });
    const results = await Promise.allSettled([closePayrollPeriod(2026, 1), closePayrollPeriod(2026, 1)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(failed.reason.message)).toMatch(/already closed/);
    expect(state.payrollPeriods).toHaveLength(1);
  });
});

describe('B47 the period lookup no longer swallows errors', () => {
  it('a thrown DB error propagates', async () => {
    control.periodError = new Error('connection reset');
    await expect(calculateMonthlyPayroll(2026, 1)).rejects.toThrow('connection reset');
  });

  it('only a "relation does not exist" error reads as no period', async () => {
    control.periodError = Object.assign(new Error('relation "mis_payroll_periods" does not exist'), { code: 'P2021' });
    await expect(calculateMonthlyPayroll(2026, 1)).resolves.toBeInstanceOf(Array);
  });
});

describe('B48 extra-pay validation and decisions', () => {
  it.each([
    [{ value: Number.NaN }, /positive/],
    [{ value: Number.POSITIVE_INFINITY }, /positive/],
    [{ value: 0 }, /positive/],
    [{ value: -5 }, /positive/],
    [{ kind: 'MULTIPLIER', value: 6 }, /at most 5/],
    [{ kind: 'FLAT_AMOUNT', value: 100001 }, /at most 100000/],
    [{ date: '2027-06-01' }, /within 400 days/],
    [{ date: '2024-12-01' }, /within 400 days/],
  ])('refuses %j', async (over, message) => {
    await expect(propose(over)).rejects.toThrow(message);
  });

  it('accepts the boundaries: multiplier 5, flat 100000', async () => {
    await expect(propose({ kind: 'MULTIPLIER', value: 5 })).resolves.toBeDefined();
    await expect(propose({ value: 100000, date: '2026-01-06' })).resolves.toBeDefined();
  });

  it('named employees must exist and be active', async () => {
    state.employees = [activeEmployee({ id: 'ok' }), activeEmployee({ id: 'gone', isActive: false })];
    await expect(propose({ scope: 'EMPLOYEES', employeeIds: ['nobody'] })).rejects.toThrow(/exist and be active/);
    await expect(propose({ scope: 'EMPLOYEES', employeeIds: ['ok', 'gone'] })).rejects.toThrow(/exist and be active/);
    await expect(propose({ scope: 'EMPLOYEES', employeeIds: ['ok'] })).resolves.toBeDefined();
  });

  it('an APPROVED day on the same date with an overlapping scope blocks a new proposal', async () => {
    const first = await propose();
    await approveExtraPayDay(first.id);
    await expect(propose({ value: 50 })).rejects.toThrow(/already covers this date/);
    await expect(propose({ date: '2026-01-06' })).resolves.toBeDefined(); // another date is fine
    state.employees = [activeEmployee({ id: 'ok' })];
    await expect(propose({ scope: 'EMPLOYEES', employeeIds: ['ok'] })).rejects.toThrow(/already covers this date/); // ALL_PRESENT overlaps everyone
  });

  it('EMPLOYEES days overlap only when they share an employee', async () => {
    state.employees = [activeEmployee({ id: 'a' }), activeEmployee({ id: 'b' })];
    const first = await propose({ scope: 'EMPLOYEES', employeeIds: ['a'] });
    await approveExtraPayDay(first.id);
    await expect(propose({ scope: 'EMPLOYEES', employeeIds: ['b'] })).resolves.toBeDefined();
    await expect(propose({ scope: 'EMPLOYEES', employeeIds: ['a', 'b'] })).rejects.toThrow(/already covers/);
  });

  it('a second decision loses with "Already decided" - approve twice, reject after approve', async () => {
    const day = await propose();
    await approveExtraPayDay(day.id);
    await expect(approveExtraPayDay(day.id)).rejects.toThrow('Already decided.');
    await expect(rejectExtraPayDay(day.id)).rejects.toThrow('Already decided.');
  });

  it('a rejection records who decided and when', async () => {
    const day = await propose();
    const rejected = await rejectExtraPayDay(day.id);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.approvedById).toBe('u1');
    expect(rejected.approvedAt).toBeInstanceOf(Date);
  });

  it('two simultaneous approvals: exactly one wins', async () => {
    const day = await propose();
    const results = await Promise.allSettled([approveExtraPayDay(day.id), approveExtraPayDay(day.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('the audit rows carry the day, status and reason - never the figure', async () => {
    const day = await propose({ value: 4321 });
    await approveExtraPayDay(day.id);
    expect(JSON.stringify(state.auditRows)).not.toContain('4321');
  });
});
