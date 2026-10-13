import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

/**
 * R3-ATT (B51-B56, B62-B64): the attendance register writes, leave, shifts and notes.
 * An in-memory db stands in for Prisma; "now" is pinned to 2026-10-13 11:30 IST.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loose in-memory row for the fake db
type Row = Record<string, any>;
const store = {
  attendance: [] as Row[],
  employees: [] as Row[],
  leaves: [] as Row[],
  periods: [] as Row[],
  shifts: [] as Row[],
};
let nextId = 1;
const id = () => `id-${nextId++}`;
const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

const matchEmployee = (e: Row, where: Row): boolean => {
  if (where.AND) return where.AND.every((w: Row) => matchEmployee(e, w));
  if (where.id !== undefined) {
    if (typeof where.id === 'string') return e.id === where.id;
    if (where.id.in) return where.id.in.includes(e.id);
  }
  if (where.userProfileId !== undefined) return e.userProfileId === where.userProfileId;
  return true;
};

const attendanceApi = () => ({
  findUnique: async ({ where }: Row) => {
    if (where.id) return store.attendance.find((r) => r.id === where.id) ?? null;
    const k = where.employeeId_date;
    return store.attendance.find((r) => r.employeeId === k.employeeId && sameDay(r.date, k.date)) ?? null;
  },
  findMany: async ({ where }: Row) =>
    store.attendance.filter((r) => sameDay(r.date, where.date) && (!where.employeeId?.in || where.employeeId.in.includes(r.employeeId))),
  upsert: async ({ where, create, update }: Row) => {
    const k = where.employeeId_date;
    const row = store.attendance.find((r) => r.employeeId === k.employeeId && sameDay(r.date, k.date));
    if (row) return Object.assign(row, update);
    const rec = { id: id(), clockIn: null, clockOut: null, editedAt: null, notes: null, approvedOut: false, lateMinutes: 0, otMinutes: 0, ...create };
    store.attendance.push(rec);
    return rec;
  },
  update: async ({ where, data }: Row) => {
    const row = store.attendance.find((r) => r.id === where.id)!;
    return Object.assign(row, data);
  },
});

const fakeDb: Row = {
  misAttendance: attendanceApi(),
  misEmployee: {
    findFirst: async ({ where }: Row) => store.employees.find((e) => matchEmployee(e, where)) ?? null,
    findMany: async ({ where }: Row) => store.employees.filter((e) => matchEmployee(e, { id: where.id }) && e.isActive && !e.deletedAt),
  },
  misLeaveRequest: {
    findUnique: async ({ where }: Row) => store.leaves.find((l) => l.id === where.id) ?? null,
    findFirst: async ({ where }: Row) =>
      store.leaves.find((l) => l.employeeId === where.employeeId && sameDay(l.date, where.date) && where.status.in.includes(l.status)) ?? null,
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
    findUnique: async ({ where }: Row) =>
      store.periods.find((p) => p.year === where.year_month.year && p.month === where.year_month.month) ?? null,
    update: async ({ where, data }: Row) => Object.assign(store.periods.find((p) => p.id === where.id)!, data),
  },
  misShift: {
    findMany: async ({ where }: Row = {}) => store.shifts.filter((s) => !where?.isActive || s.isActive),
    findUnique: async ({ where }: Row) => store.shifts.find((s) => s.id === where.id) ?? null,
    updateMany: async ({ where, data }: Row) => {
      const rows = store.shifts.filter((s) => (where.isDefault === undefined || s.isDefault === where.isDefault) && (!where.id?.not || s.id !== where.id.not));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    update: async ({ where, data }: Row) => Object.assign(store.shifts.find((s) => s.id === where.id)!, data),
    create: async ({ data }: Row) => {
      const rec = { id: id(), isActive: true, ...data };
      store.shifts.push(rec);
      return rec;
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
  getCorrectionWindowDays: async () => 3,
}));
vi.mock('@/server/mis/visibility', () => ({
  // The actor sees everyone except the employee 'hidden'.
  resolveVisibleEmployeeWhere: async () => ({ id: { in: store.employees.filter((e) => e.id !== 'hidden').map((e) => e.id) } }),
}));

const att = await import('./attendance');
const { monthBounds } = att;
const { resolveRegisterQuery, addAttendanceNote } = await import('./attendance-month');

const day = (key: string) => new Date(`${key}T00:00:00Z`);
const ACTOR = 'user-1';
const ME = 'emp-me';
const E1 = 'emp-1';

function as(role: MisRoleName) {
  getMisRole.mockResolvedValue(role);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T06:00:00Z')); // 11:30 IST on the 13th
  vi.clearAllMocks();
  nextId = 1;
  store.attendance = [];
  store.leaves = [];
  store.periods = [];
  store.shifts = [];
  store.employees = [
    { id: ME, userProfileId: ACTOR, name: 'Me Operator', isActive: true, deletedAt: null },
    { id: E1, userProfileId: null, name: 'Worker One', isActive: true, deletedAt: null },
    { id: 'emp-gone', userProfileId: null, name: 'Gone', isActive: false, deletedAt: null },
    { id: 'hidden', userProfileId: null, name: 'Hidden', isActive: true, deletedAt: null },
  ];
  getCurrentUser.mockResolvedValue({ id: ACTOR });
  as('SUPER_ATTENDANCE_OPERATOR');
});
afterEach(() => vi.useRealTimers());

const row = (over: Row = {}): Row => {
  const r = { id: id(), employeeId: E1, date: day('2026-10-13'), status: 'PRESENT', clockIn: null, clockOut: null, editedAt: null, notes: null, approvedOut: false, ...over };
  store.attendance.push(r);
  return r;
};

describe('B51 register writes', () => {
  it('(a) an unknown status is refused', async () => {
    const r = row();
    await expect(att.editAttendance(r.id, { status: 'BOGUS' })).rejects.toThrow('Unknown status');
  });

  it('(b) a row outside the correction window is refused, and one inside is edited', async () => {
    const old = row({ date: day('2026-10-01') });
    await expect(att.editAttendance(old.id, { status: 'ABSENT' })).rejects.toThrow('Outside the correction window (3 days)');
    const fresh = row({ date: day('2026-10-12') });
    await expect(att.editAttendance(fresh.id, { status: 'ABSENT' })).resolves.toMatchObject({ status: 'ABSENT' });
  });

  describe('(c) a CLOSED month', () => {
    beforeEach(() => {
      store.periods = [{ id: 'p1', year: 2026, month: 10, status: 'CLOSED', correctionsAfterClose: 0 }];
    });

    it('is refused for an ADMIN even with a reason', async () => {
      as('ADMIN');
      const r = row({ date: day('2026-10-12') });
      await expect(att.editAttendance(r.id, { status: 'ABSENT' }, { reason: 'fixing a typo' })).rejects.toThrow(/closed/);
      expect(r.status).toBe('PRESENT');
    });

    it('is refused for the OWNER without a reason of 3+ characters', async () => {
      as('OWNER');
      const r = row({ date: day('2026-10-12') });
      await expect(att.editAttendance(r.id, { status: 'ABSENT' })).rejects.toThrow(/closed/);
      await expect(att.editAttendance(r.id, { status: 'ABSENT' }, { reason: 'x' })).rejects.toThrow(/closed/);
    });

    it('is allowed for the OWNER with a reason: audit row written and the counter bumped', async () => {
      as('OWNER');
      const r = row({ date: day('2026-10-12') });
      await att.editAttendance(r.id, { status: 'ABSENT' }, { reason: 'badge was shared' });
      expect(r.status).toBe('ABSENT');
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EDIT_ATTENDANCE_AFTER_CLOSE' }));
      expect(store.periods[0].correctionsAfterClose).toBe(1);
    });
  });

  it('(d) an unknown id is a typed not-found, not a Prisma error', async () => {
    await expect(att.editAttendance('nope', { status: 'ABSENT' })).rejects.toThrow('Attendance record not found');
    await expect(att.clockOut('nope')).rejects.toThrow('Attendance record not found');
    await expect(att.approveClockOut('nope')).rejects.toThrow('Attendance record not found');
  });

  it('(e) clockOut needs a clock-in, no clock-out yet, and out > in', async () => {
    const none = row();
    await expect(att.clockOut(none.id)).rejects.toThrow('Not clocked in yet');
    const done = row({ employeeId: 'emp-x', clockIn: new Date('2026-10-13T01:00:00Z'), clockOut: new Date('2026-10-13T05:00:00Z') });
    await expect(att.clockOut(done.id)).rejects.toThrow('Already clocked out');
    const future = row({ employeeId: 'emp-y', clockIn: new Date('2026-10-13T07:00:00Z') });
    await expect(att.clockOut(future.id)).rejects.toThrow('Clock-out must be after clock-in');
    const ok = row({ employeeId: 'emp-z', clockIn: new Date('2026-10-13T01:00:00Z') });
    await expect(att.clockOut(ok.id)).resolves.toMatchObject({ id: ok.id });
  });

  it('(f) approveClockOut needs a clock-out and refuses the approver’s own row', async () => {
    const open = row({ clockIn: new Date('2026-10-13T01:00:00Z') });
    await expect(att.approveClockOut(open.id)).rejects.toThrow('There is no clock-out to approve');
    const own = row({ employeeId: ME, clockIn: new Date('2026-10-13T01:00:00Z'), clockOut: new Date('2026-10-13T05:00:00Z') });
    await expect(att.approveClockOut(own.id)).rejects.toThrow('You cannot approve your own clock-out');
    const other = row({ employeeId: 'emp-q', clockIn: new Date('2026-10-13T01:00:00Z'), clockOut: new Date('2026-10-13T05:00:00Z') });
    await expect(att.approveClockOut(other.id)).resolves.toMatchObject({ approvedOut: true });
  });

  it('(g) clockIn refuses an inactive employee and a row that already has a clock-in', async () => {
    await expect(att.clockIn('emp-gone')).rejects.toThrow('not active');
    await expect(att.clockIn('missing')).rejects.toThrow('Employee not found');
    await expect(att.clockIn(E1)).resolves.toMatchObject({ status: 'PRESENT' });
    await expect(att.clockIn(E1)).rejects.toThrow('Already clocked in today');
  });
});

describe('B52 approveLeave', () => {
  const leave = (over: Row = {}): Row => {
    const l = { id: id(), employeeId: E1, date: day('2026-10-14'), status: 'PENDING', reason: null, ...over };
    store.leaves.push(l);
    return l;
  };

  it('approve then reject the same id: the second is refused', async () => {
    const l = leave();
    await att.approveLeave(l.id, true);
    await expect(att.approveLeave(l.id, false)).rejects.toThrow('This leave was already decided');
    expect(l.status).toBe('APPROVED');
  });

  it('losing the race (status changes between read and write) gives the same message', async () => {
    const l = leave();
    const spy = vi.spyOn(fakeDb.misLeaveRequest, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await expect(att.approveLeave(l.id, true)).rejects.toThrow('This leave was already decided');
    spy.mockRestore();
  });

  it('an actor cannot decide their own request', async () => {
    const l = leave({ employeeId: ME });
    await expect(att.approveLeave(l.id, true)).rejects.toThrow('You cannot decide your own leave request');
    expect(l.status).toBe('PENDING');
  });

  it('an unknown id is a typed not-found', async () => {
    await expect(att.approveLeave('nope', true)).rejects.toThrow('Leave request not found');
  });

  it('the audit row carries before and after status', async () => {
    const l = leave();
    await att.approveLeave(l.id, false);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT_LEAVE', before: { status: 'PENDING' }, after: expect.objectContaining({ status: 'REJECTED' }) }));
  });

  it('B53: approving writes a LEAVE register row', async () => {
    const l = leave();
    await att.approveLeave(l.id, true);
    expect(store.attendance).toHaveLength(1);
    expect(store.attendance[0]).toMatchObject({ employeeId: E1, status: 'LEAVE' });
    expect(sameDay(store.attendance[0].date, l.date)).toBe(true);
  });

  it('B53: a day that already has a punch is skipped and reported', async () => {
    const l = leave({ date: day('2026-10-13') });
    const r = row({ clockIn: new Date('2026-10-13T01:00:00Z') });
    const out = await att.approveLeave(l.id, true);
    expect(out.skippedDates).toEqual(['2026-10-13']);
    expect(r.status).toBe('PRESENT');
  });

  it('B53: rejecting writes nothing to the register', async () => {
    const l = leave();
    await att.approveLeave(l.id, false);
    expect(store.attendance).toHaveLength(0);
  });
});

describe('B54 requestLeave', () => {
  it('refuses a malformed or impossible date', async () => {
    await expect(att.requestLeave(E1, '13/10/2026')).rejects.toThrow('Date must look like');
    await expect(att.requestLeave(E1, '2026-02-31')).rejects.toThrow('Date must look like');
  });

  it('refuses an inactive or unknown employee', async () => {
    await expect(att.requestLeave('emp-gone', '2026-10-20')).rejects.toThrow('not found or not active');
    await expect(att.requestLeave('missing', '2026-10-20')).rejects.toThrow('not found or not active');
  });

  it('refuses a second request for the same day while one is PENDING or APPROVED', async () => {
    await att.requestLeave(E1, '2026-10-20');
    await expect(att.requestLeave(E1, '2026-10-20')).rejects.toThrow('A leave request for this day already exists');
    store.leaves[0].status = 'REJECTED';
    await expect(att.requestLeave(E1, '2026-10-20')).resolves.toMatchObject({ status: 'PENDING' });
  });
});

describe('B55 markAbsentBulk', () => {
  it('skips a punched employee, an on-leave one and a hand-edited one, and reports why', async () => {
    row({ employeeId: E1, clockIn: new Date('2026-10-13T01:00:00Z') });
    store.employees.push({ id: 'e-leave', isActive: true, deletedAt: null }, { id: 'e-edit', isActive: true, deletedAt: null }, { id: 'e-new', isActive: true, deletedAt: null });
    row({ employeeId: 'e-leave', status: 'LEAVE' });
    row({ employeeId: 'e-edit', editedAt: new Date() });
    const out = await att.markAbsentBulk([E1, 'e-leave', 'e-edit', 'e-new']);
    expect(out.skipped.map((s) => s.employeeId).sort()).toEqual([E1, 'e-edit', 'e-leave'].sort());
    expect(store.attendance.find((r) => r.employeeId === 'e-new')).toMatchObject({ status: 'ABSENT', editedById: ACTOR });
    expect(store.attendance.find((r) => r.employeeId === E1)!.status).toBe('PRESENT');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'MARK_ABSENT_BULK', entityId: 'bulk', after: expect.objectContaining({ count: 1, employeeIds: ['e-new'] }) }));
  });

  it('one unknown or inactive id writes nothing at all', async () => {
    await expect(att.markAbsentBulk([E1, 'emp-gone'])).rejects.toThrow('not found or are not active');
    expect(store.attendance).toHaveLength(0);
  });

  it('refuses a future date, a malformed date and a date outside the window', async () => {
    await expect(att.markAbsentBulk([E1], '2026-10-14')).rejects.toThrow('future');
    await expect(att.markAbsentBulk([E1], 'soon')).rejects.toThrow('Date must look like');
    await expect(att.markAbsentBulk([E1], '2026-10-01')).rejects.toThrow('Outside the correction window');
    expect(store.attendance).toHaveLength(0);
  });
});

describe('B56 shifts', () => {
  it('validates the times, start != end, and a non-empty name', async () => {
    await expect(att.saveShift(null, { name: 'A', startTime: '25:00', endTime: '06:00' })).rejects.toThrow('Times must look like');
    await expect(att.saveShift(null, { name: 'A', startTime: '6:00', endTime: '14:00' })).rejects.toThrow('Times must look like');
    await expect(att.saveShift(null, { name: 'A', startTime: '06:00', endTime: '06:00' })).rejects.toThrow('cannot be the same');
    await expect(att.saveShift(null, { name: '   ', startTime: '06:00', endTime: '14:00' })).rejects.toThrow('name is required');
  });

  it('names are trimmed and unique among active shifts, ignoring case', async () => {
    await att.saveShift(null, { name: ' Morning ', startTime: '06:00', endTime: '14:00' });
    expect(store.shifts[0].name).toBe('Morning');
    await expect(att.saveShift(null, { name: 'MORNING', startTime: '14:00', endTime: '22:00' })).rejects.toThrow('already exists');
    // renaming a shift to its own name is fine
    await expect(att.saveShift(store.shifts[0].id, { name: 'morning', startTime: '06:00', endTime: '14:00' })).resolves.toBeTruthy();
  });

  it('isDefault clears the flag on the others in the same transaction', async () => {
    await att.saveShift(null, { name: 'A', startTime: '06:00', endTime: '14:00', isDefault: true });
    await att.saveShift(null, { name: 'B', startTime: '14:00', endTime: '22:00', isDefault: true });
    expect(store.shifts.map((s) => [s.name, s.isDefault])).toEqual([['A', false], ['B', true]]);
  });

  it('setShiftActive: audited, and the default shift cannot be deactivated', async () => {
    await att.saveShift(null, { name: 'A', startTime: '06:00', endTime: '14:00', isDefault: true });
    await att.saveShift(null, { name: 'B', startTime: '14:00', endTime: '22:00' });
    await expect(att.setShiftActive(store.shifts[0].id, false)).rejects.toThrow('default shift');
    await att.setShiftActive(store.shifts[1].id, false);
    expect(store.shifts[1].isActive).toBe(false);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DEACTIVATE_SHIFT' }));
    await att.setShiftActive(store.shifts[1].id, true);
    expect(store.shifts[1].isActive).toBe(true);
    await expect(att.setShiftActive('nope', true)).rejects.toThrow('Shift not found');
  });
});

describe('B62 month bounds and the date param', () => {
  it('October 2026 is half-open and includes the 31st', () => {
    const { gte, lt } = monthBounds('2026-10');
    const lastDay = day('2026-10-31');
    expect(gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(lastDay >= gte && lastDay < lt).toBe(true);
    expect(monthBounds('2026-12').lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('?date=foo falls back to the factory today; a good date and month pass through', () => {
    expect(resolveRegisterQuery({ date: 'foo' }, '2026-10-13')).toEqual({ date: '2026-10-13', month: '2026-10' });
    expect(resolveRegisterQuery({ date: '2026-02-31', month: '2026-13' }, '2026-10-13')).toEqual({ date: '2026-10-13', month: '2026-10' });
    expect(resolveRegisterQuery({ date: '2026-10-05', month: '2026-09' }, '2026-10-13')).toEqual({ date: '2026-10-05', month: '2026-09' });
  });
});

describe('B64 addAttendanceNote', () => {
  const ALLOWED: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'SUPER_ATTENDANCE_OPERATOR', 'ATTENDANCE_OPERATOR'];

  describe.each(MIS_ROLES)('%s', (role) => {
    it(ALLOWED.includes(role) ? 'may add a note' : 'is refused', async () => {
      as(role);
      const r = row();
      const call = addAttendanceNote(r.id, 'late bus');
      if (ALLOWED.includes(role)) await expect(call).resolves.toMatchObject({ id: r.id });
      else await expect(call).rejects.toThrow(/Not permitted: attendance\.note/);
    });
  });

  it('appends "[name factory-time] note", touching only notes', async () => {
    const r = row({ notes: 'first' });
    await addAttendanceNote(r.id, '  second  ');
    expect(r.notes).toMatch(/^first\n\[Me Operator 13\/10\/2026 .*\] second$/);
    expect(r.status).toBe('PRESENT');
    expect(r.editedAt).toBeNull();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ATTENDANCE_NOTE', before: { notes: 'first' } }));
  });

  it('is 1 to 500 characters after trimming', async () => {
    const r = row();
    await expect(addAttendanceNote(r.id, '   ')).rejects.toThrow('1 to 500');
    await expect(addAttendanceNote(r.id, 'x'.repeat(501))).rejects.toThrow('1 to 500');
    await expect(addAttendanceNote(r.id, 'x'.repeat(500))).resolves.toBeTruthy();
  });

  it('refuses a row whose employee the actor cannot see, and a closed month', async () => {
    const hidden = row({ employeeId: 'hidden' });
    await expect(addAttendanceNote(hidden.id, 'hi')).rejects.toThrow('Attendance record not found');
    store.periods = [{ id: 'p1', year: 2026, month: 10, status: 'CLOSED', correctionsAfterClose: 0 }];
    const r = row();
    await expect(addAttendanceNote(r.id, 'hi')).rejects.toThrow('closed');
  });

  it('an unknown id is a not-found', async () => {
    await expect(addAttendanceNote('nope', 'hi')).rejects.toThrow('Attendance record not found');
  });
});

describe('B63 screens and actions', () => {
  const root = path.resolve(__dirname, '../..');
  const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

  it.each([
    'components/mis/attendance/attendance-screen.tsx',
    'components/mis/attendance/leave-screen.tsx',
    'components/mis/attendance/shifts-screen.tsx',
  ])('%s uses the factory formatters, never toLocale*', (file) => {
    expect(read(file)).not.toMatch(/toLocale/);
  });

  it('every export of attendance/actions.ts is wrapped in asResult', () => {
    const src = read('app/(mis)/mis/attendance/actions.ts');
    const bodies = src.split(/^export async function /m).slice(1);
    expect(bodies.length).toBeGreaterThanOrEqual(10);
    for (const body of bodies) expect(body, body.slice(0, 40)).toContain('asResult(');
  });

  it('the shifts screen asks before deactivating and the leave screen shows refusals as a toast', () => {
    expect(read('components/mis/attendance/shifts-screen.tsx')).toMatch(/useConfirm/);
    expect(read('components/mis/attendance/leave-screen.tsx')).toMatch(/toast\('error', res\.detail\)/);
  });
});
