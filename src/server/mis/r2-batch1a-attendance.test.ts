import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MisRoleName } from '@/lib/mis/roles';

/**
 * R2 round 5, batch 1A — register + leave + shift server rules:
 * R2-165/166 bulk punch (past day, no record), R2-167 half-day leave, R2-168 cancel/revoke leave, R2-170 delete shift.
 * An in-memory db stands in for Prisma; "now" is 2026-10-13 11:30 IST.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loose in-memory row for the fake db
type Row = Record<string, any>;
const store = {
  attendance: [] as Row[],
  employees: [] as Row[],
  leaves: [] as Row[],
  periods: [] as Row[],
  shifts: [] as Row[],
  links: { productionLog: 0, lineClearance: 0, workerAllocation: 0, employeeDefault: 0 },
};
let nextId = 1;
const id = () => `id-${nextId++}`;
const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

const fakeDb: Row = {
  misAttendance: {
    findUnique: async ({ where }: Row) => {
      if (where.id) return store.attendance.find((r) => r.id === where.id) ?? null;
      const k = where.employeeId_date;
      return store.attendance.find((r) => r.employeeId === k.employeeId && sameDay(r.date, k.date)) ?? null;
    },
    findMany: async ({ where }: Row) =>
      store.attendance.filter((r) => sameDay(r.date, where.date) && (!where.employeeId?.in || where.employeeId.in.includes(r.employeeId))),
    count: async ({ where }: Row) => store.attendance.filter((r) => r.shiftId === where.shiftId).length,
    upsert: async ({ where, create, update }: Row) => {
      const k = where.employeeId_date;
      const row = store.attendance.find((r) => r.employeeId === k.employeeId && sameDay(r.date, k.date));
      if (row) return Object.assign(row, update);
      const rec = { id: id(), clockIn: null, clockOut: null, editedAt: null, notes: null, ...create };
      store.attendance.push(rec);
      return rec;
    },
    update: async ({ where, data }: Row) => Object.assign(store.attendance.find((r) => r.id === where.id)!, data),
    delete: async ({ where }: Row) => {
      store.attendance = store.attendance.filter((r) => r.id !== where.id);
    },
  },
  misEmployee: {
    findFirst: async ({ where }: Row) => store.employees.find((e) => (where.id ? e.id === where.id : e.userProfileId === where.userProfileId)) ?? null,
    findMany: async ({ where }: Row) => store.employees.filter((e) => where.id.in.includes(e.id) && e.isActive && !e.deletedAt),
    count: async () => store.links.employeeDefault,
  },
  misProductionLog: { count: async () => store.links.productionLog },
  misLineClearance: { count: async () => store.links.lineClearance },
  misWorkerAllocation: { count: async () => store.links.workerAllocation },
  misLeaveRequest: {
    findUnique: async ({ where }: Row) => store.leaves.find((l) => l.id === where.id) ?? null,
    findFirst: async () => null,
    findMany: async () => [],
    create: async ({ data }: Row) => {
      const rec = { id: id(), ...data };
      store.leaves.push(rec);
      return rec;
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = store.leaves.filter((l) => l.id === where.id && l.status === where.status);
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
  },
  misPayrollPeriod: {
    findUnique: async ({ where }: Row) => store.periods.find((p) => p.year === where.year_month.year && p.month === where.year_month.month) ?? null,
    update: async ({ where, data }: Row) => Object.assign(store.periods.find((p) => p.id === where.id)!, data),
  },
  misShift: {
    findUnique: async ({ where }: Row) => store.shifts.find((s) => s.id === where.id) ?? null,
    delete: async ({ where }: Row) => {
      store.shifts = store.shifts.filter((s) => s.id !== where.id);
    },
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
};
vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
vi.mock('@/server/mis/business-rules', () => ({
  getFactoryTimezone: async () => 'Asia/Kolkata',
  getCorrectionWindowDays: async () => 30,
  getLunchBreakMinutes: async () => 30,
}));

const att = await import('./attendance');
const day = (key: string) => new Date(`${key}T00:00:00Z`);
const ACTOR = 'user-1';
const E1 = 'emp-1';
const as = (role: MisRoleName) => getMisRole.mockResolvedValue(role);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T06:00:00Z'));
  vi.clearAllMocks();
  nextId = 1;
  store.attendance = [];
  store.leaves = [];
  store.periods = [];
  store.shifts = [];
  store.links = { productionLog: 0, lineClearance: 0, workerAllocation: 0, employeeDefault: 0 };
  store.employees = [
    { id: 'emp-me', userProfileId: ACTOR, isActive: true, deletedAt: null },
    { id: E1, userProfileId: null, isActive: true, deletedAt: null },
    { id: 'emp-2', userProfileId: null, isActive: true, deletedAt: null },
  ];
  getCurrentUser.mockResolvedValue({ id: ACTOR });
  as('SUPER_ATTENDANCE_OPERATOR');
});
afterEach(() => vi.useRealTimers());

describe('R2-165/166 bulkPunch', () => {
  it('clocks in a person with NO record on a past day at the given time (30-day window)', async () => {
    const out = await att.bulkPunch('IN', [E1], { date: '2026-10-05', time: '09:00' });
    expect(out.skipped).toEqual([]);
    expect(store.attendance).toHaveLength(1);
    expect(store.attendance[0]).toMatchObject({ employeeId: E1, status: 'PRESENT' });
    expect(store.attendance[0].clockIn.toISOString()).toBe('2026-10-05T03:30:00.000Z');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'BULK_CLOCK_IN' }));
  });

  it('a past day needs a time', async () => {
    await expect(att.bulkPunch('IN', [E1], { date: '2026-10-05' })).rejects.toThrow('Enter the time for a past date');
  });

  it('today with no time uses now; a future day is refused', async () => {
    await att.bulkPunch('IN', [E1, 'emp-2']);
    expect(store.attendance).toHaveLength(2);
    await expect(att.bulkPunch('IN', [E1], { date: '2026-10-14', time: '09:00' })).rejects.toThrow('future');
  });

  it('skips people already in or on leave, writes the rest', async () => {
    store.attendance.push({ id: 'a1', employeeId: E1, date: day('2026-10-13'), status: 'PRESENT', clockIn: new Date('2026-10-13T03:00:00Z'), clockOut: null, editedAt: null });
    const out = await att.bulkPunch('IN', [E1, 'emp-2']);
    expect(out.skipped).toEqual([{ employeeId: E1, reason: 'Already clocked in' }]);
    expect(store.attendance).toHaveLength(2);
  });

  it('bulk clock-out sets clockOut only for people clocked in and not yet out', async () => {
    store.attendance.push({ id: 'a1', employeeId: E1, date: day('2026-10-13'), status: 'PRESENT', clockIn: new Date('2026-10-13T03:00:00Z'), clockOut: null, editedAt: null });
    const out = await att.bulkPunch('OUT', [E1, 'emp-2']);
    expect(out.skipped).toEqual([{ employeeId: 'emp-2', reason: 'Not clocked in' }]);
    expect(store.attendance[0].clockOut).toBeInstanceOf(Date);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'BULK_CLOCK_OUT' }));
  });

  it('a closed month refuses a non-Owner', async () => {
    store.periods = [{ id: 'p', year: 2026, month: 10, status: 'CLOSED', correctionsAfterClose: 0 }];
    await expect(att.bulkPunch('IN', [E1], { date: '2026-10-05', time: '09:00' })).rejects.toThrow(/closed/);
    expect(store.attendance).toHaveLength(0);
  });

  it('a role without attendance.write is refused', async () => {
    as('SUPERVISOR');
    await expect(att.bulkPunch('IN', [E1])).rejects.toThrow(/Not permitted/);
  });
});

describe('R2-167 half-day leave', () => {
  const pending = (over: Row = {}): Row => {
    const l = { id: id(), employeeId: E1, date: day('2026-10-14'), endDate: null, leaveType: 'HALF_DAY', status: 'PENDING', ...over };
    store.leaves.push(l);
    return l;
  };

  it('the operator can raise it; a range is refused', async () => {
    const rec = await att.requestLeave(E1, '2026-10-14', 'dentist', { leaveType: 'HALF_DAY' });
    expect(rec).toMatchObject({ leaveType: 'HALF_DAY', status: 'PENDING' });
    await expect(att.requestLeave(E1, '2026-10-14', 'x', { leaveType: 'HALF_DAY', endDate: '2026-10-15' })).rejects.toThrow('single day');
  });

  it('the operator cannot approve a half-day; Admin and Owner can, writing a HALF_DAY (0.5) register row', async () => {
    const l = pending();
    as('SUPER_ATTENDANCE_OPERATOR');
    await expect(att.approveLeave(l.id, true)).rejects.toThrow(/Not permitted/);
    expect(l.status).toBe('PENDING');
    as('ADMIN');
    await att.approveLeave(l.id, true);
    expect(store.attendance[0]).toMatchObject({ employeeId: E1, status: 'HALF_DAY' });
    const l2 = pending({ date: day('2026-10-15') });
    as('OWNER');
    await att.approveLeave(l2.id, true);
    expect(store.attendance.map((r) => r.status)).toEqual(['HALF_DAY', 'HALF_DAY']);
  });

  it('a punch does not block it (the person works the other half); a closed month never moves', async () => {
    store.attendance.push({ id: 'a1', employeeId: E1, date: day('2026-10-14'), status: 'PRESENT', clockIn: new Date('2026-10-14T03:00:00Z'), clockOut: null, editedAt: null });
    const l = pending();
    as('ADMIN');
    await att.approveLeave(l.id, true);
    expect(store.attendance[0].status).toBe('HALF_DAY');

    store.attendance = [];
    store.periods = [{ id: 'p', year: 2026, month: 10, status: 'CLOSED', correctionsAfterClose: 0 }];
    const l2 = pending({ date: day('2026-10-15') });
    const out = await att.approveLeave(l2.id, true);
    expect(out.skippedDates).toEqual(['2026-10-15']);
    expect(store.attendance).toHaveLength(0);
  });
});

describe('R2-168 cancel leave', () => {
  const leave = (over: Row = {}): Row => {
    const l = { id: id(), employeeId: E1, date: day('2026-10-14'), endDate: null, leaveType: 'CL', status: 'PENDING', ...over };
    store.leaves.push(l);
    return l;
  };

  it('a PENDING request is withdrawn; the register is untouched; audited', async () => {
    const l = leave();
    await att.cancelLeaveRequest(l.id);
    expect(l.status).toBe('CANCELLED');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'WITHDRAW_LEAVE' }));
  });

  // R2-240: an Admin may cancel an approved leave that has not started; one that began is still the Owner's alone.
  it('an APPROVED leave: only the Owner once it has started, with a reason; the LEAVE row it made is removed; audited', async () => {
    const l = leave({ date: day('2026-10-12') }); // yesterday: already started
    as('ADMIN');
    await att.approveLeave(l.id, true);
    expect(store.attendance).toHaveLength(1);
    await expect(att.cancelLeaveRequest(l.id, 'wrong person')).rejects.toThrow('Only the Owner');
    as('OWNER');
    await expect(att.cancelLeaveRequest(l.id)).rejects.toThrow('A reason is required');
    await att.cancelLeaveRequest(l.id, 'entered in error');
    expect(l.status).toBe('CANCELLED');
    expect(store.attendance).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REVOKE_LEAVE', after: expect.objectContaining({ reason: 'entered in error' }) }));
  });

  it('R2-240: an Admin cancels an approved leave that starts tomorrow, with a reason; the register row goes back', async () => {
    const l = leave({ date: day('2026-10-14'), status: 'APPROVED' });
    store.attendance.push({ id: 'a1', employeeId: E1, date: day('2026-10-14'), status: 'LEAVE', clockIn: null, clockOut: null, editedAt: null });
    as('ADMIN');
    await expect(att.cancelLeaveRequest(l.id)).rejects.toThrow('A reason is required');
    await att.cancelLeaveRequest(l.id, 'plans changed');
    expect(l.status).toBe('CANCELLED');
    expect(store.attendance).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REVOKE_LEAVE' }));
  });

  it('R2-240: the person on leave cancels their own future approved leave; not someone else’s; an operator cannot', async () => {
    const mine = leave({ employeeId: 'emp-me', date: day('2026-10-20'), status: 'APPROVED' });
    as('WORKER');
    await att.cancelLeaveRequest(mine.id, 'trip cancelled');
    expect(mine.status).toBe('CANCELLED');
    const other = leave({ employeeId: E1, date: day('2026-10-20'), status: 'APPROVED' });
    await expect(att.cancelLeaveRequest(other.id, 'nope')).rejects.toThrow(/Not permitted/);
    as('SUPER_ATTENDANCE_OPERATOR');
    await expect(att.cancelLeaveRequest(other.id, 'nope')).rejects.toThrow('Only the Owner, an Admin or the person on leave');
    expect(other.status).toBe('APPROVED');
  });

  it('revoking a half-day with a punch leaves a PRESENT row', async () => {
    store.attendance.push({ id: 'a1', employeeId: E1, date: day('2026-10-14'), status: 'HALF_DAY', clockIn: new Date('2026-10-14T03:00:00Z'), clockOut: null, editedAt: null });
    const l = leave({ leaveType: 'HALF_DAY', status: 'APPROVED' });
    as('OWNER');
    await att.cancelLeaveRequest(l.id, 'changed plans');
    expect(store.attendance[0].status).toBe('PRESENT');
  });

  it('a closed month cannot be revoked', async () => {
    store.periods = [{ id: 'p', year: 2026, month: 10, status: 'CLOSED', correctionsAfterClose: 0 }];
    const l = leave({ status: 'APPROVED' });
    as('OWNER');
    await expect(att.cancelLeaveRequest(l.id, 'oops')).rejects.toThrow(/closed/);
    expect(l.status).toBe('APPROVED');
  });

  it('a decided (rejected) leave cannot be cancelled', async () => {
    const l = leave({ status: 'REJECTED' });
    await expect(att.cancelLeaveRequest(l.id)).rejects.toThrow('Only a pending or approved');
  });
});

describe('R2-170 deleteShift', () => {
  const shift = (over: Row = {}) => {
    const s = { id: 'sh1', name: 'Trial', isDefault: false, isActive: true, ...over };
    store.shifts.push(s);
    return s;
  };

  it('deletes an unused shift and audits it', async () => {
    shift();
    await att.deleteShift('sh1');
    expect(store.shifts).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_SHIFT', entityId: 'sh1' }));
  });

  it('refuses when attendance rows exist', async () => {
    shift();
    store.attendance.push({ id: 'a', employeeId: E1, date: day('2026-10-13'), shiftId: 'sh1' });
    await expect(att.deleteShift('sh1')).rejects.toThrow(/in use/);
    expect(store.shifts).toHaveLength(1);
  });

  it('refuses when an employee defaults to it, and for the default shift', async () => {
    shift();
    store.links.employeeDefault = 1;
    await expect(att.deleteShift('sh1')).rejects.toThrow(/in use/);
    store.links.employeeDefault = 0;
    store.shifts[0].isDefault = true;
    await expect(att.deleteShift('sh1')).rejects.toThrow(/default shift/);
  });
});
