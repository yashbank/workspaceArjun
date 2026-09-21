/**
 * Phase 24D · D8 — `getAttendanceMonthView` at the SERVER FUNCTION.
 *
 * `attendance.read` is held by OWNER, ADMIN, SUPERVISOR, SUPER_ATTENDANCE_OPERATOR and
 * ATTENDANCE_OPERATOR; QC, STORE_GUY and WORKER are refused with no query. The month is the
 * FACTORY's (D22), attendance dates are `@db.Date` keys, and nothing here is money — `canPayroll`
 * is a flag, and only the Owner's is true.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const queries: string[] = [];
const world: { zone: string; departments: Row[]; employees: Row[]; attendance: Row[]; leaves: Row[] } = {
  zone: 'Asia/Kolkata', departments: [], employees: [], attendance: [], leaves: [],
};
const inRange = (d: Date, r: { gte: Date; lte: Date }) => d >= r.gte && d <= r.lte;

vi.mock('@/server/db', () => ({
  db: {
    misDepartment: { findMany: async () => { queries.push('departments'); return world.departments; } },
    misEmployee: {
      findMany: async (args: { where: { departmentId?: string; OR: [unknown, { attendance: { some: { date: { gte: Date; lte: Date } } } }] } }) => {
        queries.push('employees');
        const range = args.where.OR[1].attendance.some.date;
        return world.employees
          .filter((e) => {
            if (args.where.departmentId && e.departmentId !== args.where.departmentId) return false;
            return e.isActive || world.attendance.some((a) => a.employeeId === e.id && inRange(a.date as Date, range));
          })
          .sort((a, b) => String(a.name).localeCompare(String(b.name))); // the caller's `orderBy: { name: 'asc' }`
      },
    },
    misAttendance: {
      findMany: async (args: { where: { employeeId: { in: string[] }; date: { gte: Date; lte: Date } } }) => {
        queries.push('attendance');
        return world.attendance.filter((a) => args.where.employeeId.in.includes(a.employeeId as string) && inRange(a.date as Date, args.where.date));
      },
    },
    misLeaveRequest: {
      findMany: async (args: { where: { employeeId: { in: string[] }; status?: string; date: { gte: Date; lte: Date } } }) => {
        queries.push('leaves');
        return world.leaves.filter(
          (l) => args.where.employeeId.in.includes(l.employeeId as string) && (!args.where.status || l.status === args.where.status) && inRange(l.date as Date, args.where.date),
        );
      },
    },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => world.zone }));

const { getAttendanceMonthView } = await import('./attendance-month');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'SUPER_ATTENDANCE_OPERATOR', 'ATTENDANCE_OPERATOR'];
const NOW = new Date('2026-09-21T08:00:00Z');
const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};
const denied = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e as Error).name === 'MisForbiddenError';
  }
};

const shift1 = { name: 'Shift 1', startTime: '06:00', endTime: '15:00' };
const att = (employeeId: string, day: string, over: Row = {}): Row => ({
  employeeId, date: new Date(`2026-08-${day}T00:00:00Z`), status: 'PRESENT', clockIn: null, clockOut: null, otMinutes: 0, lateMinutes: 0, shift: shift1, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  world.zone = 'Asia/Kolkata';
  world.departments = [{ id: 'd1', name: 'Printing' }, { id: 'd2', name: 'Die cutting' }];
  world.employees = [
    { id: 'e1', name: 'Anil', employeeCode: 'BPP-031', departmentId: 'd2', isActive: true, department: { name: 'Die cutting' } },
    { id: 'e2', name: 'Ramesh', employeeCode: 'BPP-014', departmentId: 'd1', isActive: true, department: { name: 'Printing' } },
    { id: 'e3', name: 'Left Mid-month', employeeCode: 'BPP-099', departmentId: 'd1', isActive: false, department: { name: 'Printing' } },
    { id: 'e4', name: 'Left Long Ago', employeeCode: 'BPP-100', departmentId: 'd1', isActive: false, department: { name: 'Printing' } },
  ];
  world.attendance = [
    att('e2', '03'), att('e2', '04', { otMinutes: 120 }), att('e2', '05', { status: 'ABSENT' }),
    att('e2', '28', { clockIn: new Date('2026-08-28T00:34:00Z'), clockOut: new Date('2026-08-28T12:32:00Z'), otMinutes: 178, lateMinutes: 4 }),
    att('e1', '03'),
    att('e3', '10'),
    { ...att('e2', '31'), date: new Date('2026-09-01T00:00:00Z') }, // next month: must not appear
  ];
  world.leaves = [
    { employeeId: 'e1', date: new Date('2026-08-12T00:00:00Z'), status: 'APPROVED' },
    { employeeId: 'e1', date: new Date('2026-08-13T00:00:00Z'), status: 'PENDING' },
    { employeeId: 'e1', date: new Date('2026-08-14T00:00:00Z'), status: 'REJECTED' },
  ];
});

describe('getAttendanceMonthView — who may read it', () => {
  it.each(READERS)('%s is served the month', async (role) => {
    as(role);
    const v = await getAttendanceMonthView({}, NOW);
    expect(v.rows.length).toBeGreaterThan(0);
    expect(v.days).toHaveLength(31);
    expect(v.identityHolds).toBe(true);
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is REFUSED at the function — and no query runs', async (role) => {
    as(role);
    expect(await denied(() => getAttendanceMonthView({}, NOW))).toBe(true);
    expect(queries).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await denied(() => getAttendanceMonthView({}, NOW))).toBe(true);
    expect(queries).toEqual([]);
  });

  it.each(READERS)('%s: no money key or value in the payload — only the payroll FLAG differs, and only the Owner\'s is true (D24)', async (role) => {
    as(role);
    const v = await getAttendanceMonthView({}, NOW);
    const { canPayroll, ...rest } = v;
    expect(JSON.stringify(rest)).not.toMatch(/rate|price|cost|wage|salary|amount|rupee|₹|gross|net|pay\b/i);
    expect(canPayroll).toBe(role === 'OWNER');
  });
});

describe('the month is the FACTORY\'s (D22)', () => {
  it('defaults to the last finished month', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({}, NOW);
    expect(v).toMatchObject({ monthKey: '2026-08', running: false, prevKey: '2026-07', nextKey: '2026-09', currentKey: '2026-09' });
  });

  it('01:30 IST on 1 Sep is still 31 Aug in UTC — the factory is already in September, so August is the finished month', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({}, new Date('2026-08-31T20:00:00Z'));
    expect(v).toMatchObject({ currentKey: '2026-09', monthKey: '2026-08' });
    world.zone = 'UTC';
    expect(await getAttendanceMonthView({}, new Date('2026-08-31T20:00:00Z'))).toMatchObject({ currentKey: '2026-08', monthKey: '2026-07' });
  });

  it('the running month is reachable by asking, is flagged, and has no "next"', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({ month: '2026-09' }, NOW);
    expect(v).toMatchObject({ monthKey: '2026-09', running: true, nextKey: null });
  });

  it('a future month is clamped, an unreadable one is ignored', async () => {
    as('OWNER');
    expect((await getAttendanceMonthView({ month: '2027-01' }, NOW)).monthKey).toBe('2026-09');
    expect((await getAttendanceMonthView({ month: ['2026-05'] }, NOW)).monthKey).toBe('2026-08');
  });

  it('a row dated the 1st of the next month is NOT in this month\'s grid', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({}, NOW);
    const ramesh = v.rows.find((r) => r.id === 'e2')!;
    expect(ramesh.counts.present).toBe(3); // 3 Aug, 4 Aug, 28 Aug — not 1 Sep
  });
});

describe('the grid', () => {
  it('lists people by name, one cell per calendar day, states from the register', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({}, NOW);
    expect(v.rows.map((r) => r.name)).toEqual(['Anil', 'Left Mid-month', 'Ramesh']); // active + left-mid-month; NOT the one with no August rows
    const ramesh = v.rows.find((r) => r.id === 'e2')!;
    expect(ramesh.cells).toHaveLength(31);
    expect(ramesh.cells[2]).toBe('PRESENT'); // 3 Aug
    expect(ramesh.cells[3]).toBe('PRESENT_OT'); // 4 Aug — a stripe, still one cell
    expect(ramesh.cells[4]).toBe('ABSENT');
    expect(ramesh.cells[5]).toBe('NONE'); // 6 Aug: nobody wrote anything down
    expect(ramesh.counts).toMatchObject({ present: 3, absent: 1, otMinutes: 298 });
  });

  it('an approved leave request with no attendance row is a leave day', async () => {
    as('OWNER');
    const anil = (await getAttendanceMonthView({}, NOW)).rows.find((r) => r.id === 'e1')!;
    expect(anil.cells[11]).toBe('LEAVE'); // 12 Aug
    expect(anil.counts.leave).toBe(1);
  });

  it('a PENDING or REJECTED leave request is not leave — the day is still not recorded', async () => {
    as('OWNER');
    const anil = (await getAttendanceMonthView({}, NOW)).rows.find((r) => r.id === 'e1')!;
    expect(anil.cells[12]).toBe('NONE'); // 13 Aug, pending
    expect(anil.cells[13]).toBe('NONE'); // 14 Aug, rejected
  });

  it('the footer is the sum of the rows, and slots = workers × days', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({}, NOW);
    expect(v.totals).toMatchObject({ workers: 3, days: 31, slots: 93, present: 5, absent: 1, leave: 1, none: 86, otMinutes: 298 });
    expect(v.totals.present + v.totals.half + v.totals.absent + v.totals.leave + v.totals.none + v.totals.other).toBe(93);
  });

  it('the department "pool" narrows the people, and the totals follow the visible rows', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({ departmentId: 'd1' }, NOW);
    expect(v.departmentName).toBe('Printing');
    expect(v.rows.map((r) => r.name)).toEqual(['Left Mid-month', 'Ramesh']);
    expect(v.totals.workers).toBe(2);
    expect(v.identityHolds).toBe(true);
  });

  it('an unknown department is ignored, not an empty screen', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({ departmentId: 'nope' }, NOW);
    expect(v.departmentId).toBeNull();
    expect(v.rows).toHaveLength(3);
  });

  it('an empty pool is an empty grid that still says so honestly — and asks nothing further', async () => {
    as('OWNER');
    world.employees = [];
    const v = await getAttendanceMonthView({}, NOW);
    expect(v.rows).toEqual([]);
    expect(v.selected).toBeNull();
    expect(queries).not.toContain('attendance');
  });
});

describe('the side panels', () => {
  it('default to the first person, with their own month tallied from their own cells', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({}, NOW);
    expect(v.selected).toMatchObject({ id: 'e1', dayKey: null, day: null, dayState: null });
    expect(v.selected!.month).toMatchObject({ present: 1, leave: 1, days: 31 });
  });

  it('a chosen person and day show the recorded punches, on the factory clock, with the working', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({ employeeId: 'e2', day: '2026-08-28' }, NOW);
    expect(v.selected).toMatchObject({ id: 'e2', dayKey: '2026-08-28', dayState: 'PRESENT_OT' });
    expect(v.selected!.day).toMatchObject({ inLabel: '06:04', outLabel: '18:02', workedMinutes: 718, shiftMinutes: 540, impliedOtMinutes: 178, recordedOtMinutes: 178, otAgrees: true, shiftLabel: '06:00 – 15:00' });
  });

  it('a day with no record says NONE and carries no invented punches', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({ employeeId: 'e2', day: '2026-08-06' }, NOW);
    expect(v.selected).toMatchObject({ dayState: 'NONE', day: null });
  });

  it('a day outside the month, or an unknown person, falls back rather than crashing', async () => {
    as('OWNER');
    const v = await getAttendanceMonthView({ employeeId: 'ghost', day: '2026-09-05' }, NOW);
    expect(v.selected).toMatchObject({ id: 'e1', dayKey: null });
  });
});
