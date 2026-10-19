/**
 * R2-109 (bulk payslip print) and R2-111 (Owner releases a payslip; the employee sees their OWN
 * released slips for PREVIOUS months only).
 *
 * Figures are worked by hand at the wage-world fixture rates: 731.19 a day (WG-DAILY-01), overtime
 * ×2.375 of (day ÷ 8) per hour, late penalty 0.83 a minute.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES } from '@/lib/mis/roles';

import { BASE_SENTINELS, EMP, fakeDb, findLeaks, outcome, seedWorld, state, type Row } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

// The wage-world fake db knows payroll; the release table and a per-login employee lookup are added here.
const releases: Row[] = [];
const people: Row[] = [];
const db = fakeDb as unknown as Record<string, Record<string, (args: Row) => Promise<unknown>>>;
db.misPayslipRelease = {
  findMany: async ({ where }: Row) =>
    releases
      .filter((r) => (where.employeeId === undefined || (typeof where.employeeId === 'object' ? where.employeeId.in.includes(r.employeeId) : r.employeeId === where.employeeId)))
      .filter((r) => (where.year === undefined || r.year === where.year) && (where.month === undefined || r.month === where.month))
      .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month)),
  findUnique: async ({ where }: Row) => {
    const k = where.employeeId_year_month;
    return releases.find((r) => r.employeeId === k.employeeId && r.year === k.year && r.month === k.month) ?? null;
  },
  createMany: async ({ data }: Row) => {
    for (const d of data as Row[]) releases.push({ id: `rel-${releases.length + 1}`, releasedAt: new Date('2026-02-02T05:00:00Z'), ...d });
    return { count: (data as Row[]).length };
  },
  deleteMany: async ({ where }: Row) => {
    const before = releases.length;
    for (let i = releases.length - 1; i >= 0; i--) {
      const r = releases[i];
      if (r.employeeId === where.employeeId && r.year === where.year && r.month === where.month) releases.splice(i, 1);
    }
    return { count: before - releases.length };
  },
};
db.misEmployee.findUnique = async ({ where }: Row) => people.find((p) => p.userProfileId === where.userProfileId) ?? null;
db.misPayrollSnapshotLine.findFirst = async ({ where }: Row) =>
  state.payrollSnapshotLines.find((l) => l.periodId === where.periodId && l.employeeId === where.employeeId) ?? null;

const { getPayslipBatch, listPayslipReleases, releasePayslips, withdrawPayslipRelease, listMyPayslips, getMyPayslip } = await import('./payslips');

const BALA = { id: '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', name: 'Bala', employeeCode: 'E-002' };
const NON_OWNER = MIS_ROLES.filter((r) => r !== 'OWNER');

const line = (employee: { id: string; name: string; employeeCode: string }, figures: Partial<Row>) => ({
  id: `line-${employee.id}`, periodId: 'p-jan', employeeId: employee.id, employeeCode: employee.employeeCode, employeeName: employee.name,
  payType: 'DAILY', workingDays: 31, present: 3, halfDay: 0, absent: 0, leave: 0, otMinutes: 90, lateMinutes: 300, allowanceDays: 0,
  basicWage: 2194, hra: 0, allowance: 0, otPay: 326, bonus: 0, extraPay: 0, latePenalty: 249, grossPay: 2270,
  wageTypeCode: 'WG-DAILY-01', ...figures,
});

function closeJanuary() {
  state.payrollPeriods = [{ id: 'p-jan', year: 2026, month: 1, status: 'CLOSED' }];
  state.payrollSnapshotLines = [line(EMP, {}), line(BALA, { present: 1, otMinutes: 0, lateMinutes: 0, basicWage: 731, otPay: 0, latePenalty: 0, grossPay: 731 })];
}

const asOwner = () => {
  getCurrentUser.mockResolvedValue({ id: 'u-owner' });
  getMisRole.mockResolvedValue('OWNER');
};
/** Sign in as an employee-linked user (any role — the release view is an identity check, not a role grant). */
const asEmployee = (userId: string, role = 'SUPERVISOR') => {
  getCurrentUser.mockResolvedValue({ id: userId });
  getMisRole.mockResolvedValue(role);
  people.find((p) => p.userProfileId === userId)!.role = role;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-02-15T06:00:00Z')); // "today" is in February; January is the previous month
  seedWorld();
  releases.length = 0;
  people.length = 0;
  people.push(
    { id: EMP.id, userProfileId: 'u-asha', name: EMP.name, employeeCode: EMP.employeeCode, role: 'SUPERVISOR', isActive: true, deletedAt: null, department: { name: 'Printing' } },
    { id: BALA.id, userProfileId: 'u-bala', name: BALA.name, employeeCode: BALA.employeeCode, role: 'QC', isActive: true, deletedAt: null, department: null },
  );
  asOwner();
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// R2-109 — bulk print
// ---------------------------------------------------------------------------
describe('R2-109 — getPayslipBatch: every payslip of a month from ONE payroll run', () => {
  const rec = (id: string, date: string, employee: object, lateMinutes = 0, otMinutes = 0) => ({ id, date: new Date(date), status: 'PRESENT', lateMinutes, otMinutes, employee, shift: { name: 'Day' } });

  it('an OPEN month: two slips, exact figures, one attendance query (no per-employee recompute)', async () => {
    state.attendance = [
      rec('1', '2026-01-05', EMP, 300, 0), rec('2', '2026-01-06', EMP, 0, 90), rec('3', '2026-01-07', EMP),
      rec('4', '2026-01-05', BALA),
    ];
    state.employees = [{ id: EMP.id, role: 'SUPERVISOR', wageTypeCode: null }, { id: BALA.id, role: 'QC', wageTypeCode: null }];
    const slips = await getPayslipBatch(2026, 1);

    expect(state.attendanceWhere).toHaveLength(1);
    expect(slips.map((s) => s.employee.employeeCode)).toEqual(['E-001', 'E-002']);
    // Asha: 3 × 731.19 = 2193.57 → 2194; OT 1.5 h × (731.19 ÷ 8 × 2.375 = 217.072) = 325.61 → 326;
    // late 300 × 0.83 = 249; gross 2193.57 + 325.61 − 249 = 2270.18 → 2270.
    expect(slips[0].row).toMatchObject({ basicWage: 2194, otPay: 326, latePenalty: 249, grossPay: 2270 });
    expect(slips[0].employee).toMatchObject({ name: 'Asha', role: 'SUPERVISOR' });
    // Bala: 1 × 731.19 → 731.
    expect(slips[1].row).toMatchObject({ basicWage: 731, otPay: 0, latePenalty: 0, grossPay: 731 });
    expect(slips[1].employee.role).toBe('QC');
  });

  it('a CLOSED month prints the frozen snapshot, not a live recompute', async () => {
    closeJanuary();
    state.attendance = []; // live data gone — the snapshot still prints
    const slips = await getPayslipBatch(2026, 1);
    expect(state.attendanceWhere).toHaveLength(0);
    expect(slips.map((s) => s.row.grossPay)).toEqual([2270, 731]);
  });

  it('an empty month is an empty batch; a nonsense month is refused', async () => {
    state.attendance = [];
    expect(await getPayslipBatch(2026, 1)).toEqual([]);
    await expect(getPayslipBatch(2026, 13)).rejects.toThrow(/month between 1 and 12/);
  });

  it.each(NON_OWNER)('%s is refused (wages.read)', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(getPayslipBatch(2026, 1)).rejects.toThrow(/Not permitted: wages\.read/);
  });
});

// ---------------------------------------------------------------------------
// R2-111 — the Owner sends
// ---------------------------------------------------------------------------
describe('R2-111 — releasePayslips / withdrawPayslipRelease / listPayslipReleases (Owner)', () => {
  it('refuses an OPEN month: only a closed month’s frozen slip can be sent', async () => {
    await expect(releasePayslips(2026, 1)).rejects.toThrow(/Close this month first/);
    expect(releases).toHaveLength(0);
  });

  it('refuses the current and a future month', async () => {
    await expect(releasePayslips(2026, 2)).rejects.toThrow(/past month/);
    await expect(releasePayslips(2026, 3)).rejects.toThrow(/past month/);
  });

  it('sends to everyone with a frozen line, once; a second send is a no-op; audit carries counts, never money', async () => {
    closeJanuary();
    expect(await releasePayslips(2026, 1)).toEqual({ released: 2, alreadyReleased: 0 });
    expect(await releasePayslips(2026, 1)).toEqual({ released: 0, alreadyReleased: 2 });
    expect(releases.map((r) => [r.employeeId, r.year, r.month, r.releasedById])).toEqual([
      [EMP.id, 2026, 1, 'u-owner'],
      [BALA.id, 2026, 1, 'u-owner'],
    ]);
    const audit = state.auditRows.filter((r) => r.action === 'payslip.release');
    expect(audit[0].after).toEqual({ year: 2026, month: 1, released: 2, alreadyReleased: 0 });
    expect(findLeaks(audit, { keys: /wage|salary|gross|pay$|amount/i, values: ['2270', '731', '2194', ...BASE_SENTINELS] })).toEqual([]);
  });

  it('sends to one employee only; an employee with no frozen line is refused', async () => {
    closeJanuary();
    expect(await releasePayslips(2026, 1, [EMP.id])).toEqual({ released: 1, alreadyReleased: 0 });
    expect(releases.map((r) => r.employeeId)).toEqual([EMP.id]);
    await expect(releasePayslips(2026, 1, ['00000000-0000-4000-8000-000000000000'])).rejects.toThrow(/No payslip was frozen/);
  });

  it('lists who was sent, and withdraw takes one back (audited both sides)', async () => {
    closeJanuary();
    await releasePayslips(2026, 1);
    expect((await listPayslipReleases(2026, 1)).map((r) => r.employeeId).sort()).toEqual([EMP.id, BALA.id].sort());
    await withdrawPayslipRelease(EMP.id, 2026, 1);
    expect((await listPayslipReleases(2026, 1)).map((r) => r.employeeId)).toEqual([BALA.id]);
    const w = state.auditRows.find((r) => r.action === 'payslip.withdraw');
    expect(w).toMatchObject({ entityId: EMP.id, before: { year: 2026, month: 1, released: true }, after: { year: 2026, month: 1, released: false } });
  });

  it('a database without the release table (migration not applied) lists nothing instead of failing', async () => {
    const original = db.misPayslipRelease.findMany;
    db.misPayslipRelease.findMany = async () => { throw Object.assign(new Error('relation "mis_payslip_releases" does not exist'), { code: 'P2021' }); };
    try {
      expect(await listPayslipReleases(2026, 1)).toEqual([]);
      asEmployee('u-asha');
      expect(await listMyPayslips()).toEqual([]);
    } finally {
      db.misPayslipRelease.findMany = original;
    }
  });

  describe.each(NON_OWNER)('%s', (role) => {
    it('cannot send, take back or list releases (wages.read)', async () => {
      closeJanuary();
      getMisRole.mockResolvedValue(role);
      await expect(releasePayslips(2026, 1)).rejects.toThrow(/Not permitted: wages\.read/);
      await expect(releasePayslips(2026, 1, [EMP.id])).rejects.toThrow(/Not permitted: wages\.read/);
      await expect(withdrawPayslipRelease(EMP.id, 2026, 1)).rejects.toThrow(/Not permitted: wages\.read/);
      await expect(listPayslipReleases(2026, 1)).rejects.toThrow(/Not permitted: wages\.read/);
      expect(releases).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// R2-111 — the employee's own view
// ---------------------------------------------------------------------------
describe('R2-111 — listMyPayslips / getMyPayslip (employee-linked users)', () => {
  it.each(MIS_ROLES)('as %s: sees ONLY their own released slip, with their own exact figures', async (role) => {
    closeJanuary();
    await releasePayslips(2026, 1); // both employees released
    asEmployee('u-asha', role);

    const list = await listMyPayslips();
    expect(list.map((s) => [s.year, s.month])).toEqual([[2026, 1]]);

    const slip = await getMyPayslip(2026, 1);
    expect(slip?.employee).toMatchObject({ id: EMP.id, name: 'Asha', employeeCode: 'E-001' });
    expect(slip?.row).toMatchObject({ employeeId: EMP.id, basicWage: 2194, otPay: 326, latePenalty: 249, grossPay: 2270 });
    // Never Bala's figures.
    expect(JSON.stringify(slip)).not.toContain(BALA.id);
    expect(slip?.row.grossPay).not.toBe(731);
  });

  it('never a wage setting: no wage code, no rate, no rule value reaches the employee', async () => {
    closeJanuary();
    await releasePayslips(2026, 1, [EMP.id]);
    asEmployee('u-asha', 'ATTENDANCE_OPERATOR');
    const slip = await getMyPayslip(2026, 1);
    expect(slip?.row.wageTypeCode).toBeNull();
    const text = JSON.stringify(slip);
    expect(text).not.toContain('WG-DAILY-01');
    // (wageTypeCode is present only as null, asserted above.)
    expect(findLeaks(slip, { keys: /rate|rule|amount/i, values: BASE_SENTINELS })).toEqual([]);
    expect(findLeaks(await listMyPayslips(), { keys: /wage|salary|gross|pay|amount|rate/i, values: ['2270', '2194', ...BASE_SENTINELS] })).toEqual([]);
  });

  it('a slip that was not sent is invisible — even though it is frozen', async () => {
    closeJanuary();
    await releasePayslips(2026, 1, [BALA.id]); // only Bala
    asEmployee('u-asha');
    expect(await listMyPayslips()).toEqual([]);
    expect(await getMyPayslip(2026, 1)).toBeNull();
  });

  it('never the current month — even if a release row and a snapshot exist for it', async () => {
    state.payrollPeriods = [{ id: 'p-feb', year: 2026, month: 2, status: 'CLOSED' }];
    state.payrollSnapshotLines = [{ ...line(EMP, {}), periodId: 'p-feb' }];
    releases.push({ id: 'r-feb', employeeId: EMP.id, year: 2026, month: 2, releasedAt: new Date('2026-02-14T00:00:00Z') });
    asEmployee('u-asha');
    expect(await listMyPayslips()).toEqual([]);
    expect(await getMyPayslip(2026, 2)).toBeNull();
    expect(await getMyPayslip(2026, 3)).toBeNull();
  });

  it('a month that becomes "previous" shows up once the calendar moves on', async () => {
    closeJanuary();
    await releasePayslips(2026, 1, [EMP.id]);
    vi.setSystemTime(new Date('2026-01-20T06:00:00Z')); // back in January: January is the current month
    asEmployee('u-asha');
    expect(await listMyPayslips()).toEqual([]);
    expect(await getMyPayslip(2026, 1)).toBeNull();
  });

  it('a released slip whose month was not closed is not shown (nothing un-frozen ever leaves)', async () => {
    releases.push({ id: 'r-dec', employeeId: EMP.id, year: 2025, month: 12, releasedAt: new Date('2026-01-02T00:00:00Z') });
    asEmployee('u-asha');
    expect(await getMyPayslip(2025, 12)).toBeNull();
  });

  it('there is no way to ask for someone else’s slip: the employee comes from the login', async () => {
    closeJanuary();
    await releasePayslips(2026, 1, [BALA.id]);
    asEmployee('u-asha', 'ADMIN');
    // getMyPayslip takes no employee id at all; Asha asking for January gets nothing (hers was not sent).
    expect(getMyPayslip.length).toBe(2);
    expect(await getMyPayslip(2026, 1)).toBeNull();
    asEmployee('u-bala', 'QC');
    expect((await getMyPayslip(2026, 1))?.row).toMatchObject({ employeeId: BALA.id, grossPay: 731 });
  });

  it('refuses a caller with no login, no employee record, or an inactive / deleted record', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await outcome(() => listMyPayslips())).toBe('denied');
    getCurrentUser.mockResolvedValue({ id: 'u-stranger' });
    expect(await outcome(() => getMyPayslip(2026, 1))).toBe('denied');
    people[0].isActive = false;
    getCurrentUser.mockResolvedValue({ id: 'u-asha' });
    expect(await outcome(() => listMyPayslips())).toBe('denied');
    people[0].isActive = true;
    people[0].deletedAt = new Date();
    expect(await outcome(() => getMyPayslip(2026, 1))).toBe('denied');
  });
});
