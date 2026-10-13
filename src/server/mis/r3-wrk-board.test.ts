/**
 * R3-WRK: machine booking rules (B97), board sync flag (B99), crew counts (B95, B96, B100),
 * the order crew (B103) and the manpower report (B102).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const IST = (key: string, hhmm: string) => new Date(`${key}T${hhmm}:00+05:30`);

const q = {
  machine: vi.fn(), order: vi.fn(), overlap: vi.fn(), create: vi.fn(), allocFindMany: vi.fn(),
  logs: vi.fn(), employees: vi.fn(), attendance: vi.fn(), leaves: vi.fn(), workers: vi.fn(), shifts: vi.fn(), locks: vi.fn(),
};
const fakeDb: Row = {
  misMachine: { findFirst: (...a: unknown[]) => q.machine(...a), findMany: async () => [] },
  misOrder: { findFirst: (...a: unknown[]) => q.order(...a) },
  misMachineAllocation: {
    findFirst: (...a: unknown[]) => q.overlap(...a),
    create: (...a: unknown[]) => q.create(...a),
    findMany: (...a: unknown[]) => q.allocFindMany(...a),
  },
  misProductionLog: { findMany: (...a: unknown[]) => q.logs(...a) },
  misEmployee: { findMany: (...a: unknown[]) => q.employees(...a) },
  misAttendance: { findMany: (...a: unknown[]) => q.attendance(...a) },
  misLeaveRequest: { findMany: (...a: unknown[]) => q.leaves(...a) },
  misWorkerAllocation: { findMany: (...a: unknown[]) => q.workers(...a) },
  misShift: { findMany: (...a: unknown[]) => q.shifts(...a), findFirst: async () => null },
  $queryRaw: async (_s: unknown, key: string) => q.locks(key),
};
// A transaction on one machine at a time, as the advisory lock makes it.
let chain: Promise<unknown> = Promise.resolve();
fakeDb.$transaction = (fn: (tx: unknown) => unknown) => {
  const run = chain.then(() => fn(fakeDb));
  chain = run.catch(() => undefined);
  return run;
};
vi.mock('@/server/db', () => ({ db: fakeDb }));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/visibility', () => ({ resolveVisibleEmployeeWhere: async () => ({}) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));
vi.mock('@/server/mis/job-phases', () => ({ isActiveStatus: () => true, getPhasesForOrder: async () => [] }));

const { allocateMachine, getMachineBoard } = await import('./machines-board');
const { getCrewSummary, getCrewForOrder, getManpowerReport } = await import('./worker-allocation');
const { getNavBadges } = await import('./navigation');

const HOUR = 3600_000;
const START = IST('2026-10-13', '08:00');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(IST('2026-10-13', '10:30'));
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('SUPERVISOR');
  q.machine.mockResolvedValue({ id: 'm1', isActive: true, deletedAt: null });
  q.order.mockResolvedValue({ status: 'IN_PRODUCTION' });
  q.overlap.mockResolvedValue(null);
  q.create.mockImplementation(async ({ data }: Row) => ({ id: 'a1', ...data }));
  q.allocFindMany.mockResolvedValue([]);
  q.logs.mockResolvedValue([]);
  q.employees.mockResolvedValue([]);
  q.attendance.mockResolvedValue([]);
  q.leaves.mockResolvedValue([]);
  q.workers.mockResolvedValue([]);
  q.shifts.mockResolvedValue([{ id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '14:00' }]);
});

describe('B97 allocateMachine rules', () => {
  const ok = { machineId: 'm1', startsAt: START, endsAt: new Date(START.getTime() + 4 * HOUR) };

  it.each([0, -2])('refuses a duration of %i hours', async (h) => {
    await expect(allocateMachine({ ...ok, endsAt: new Date(START.getTime() + h * HOUR) })).rejects.toThrow(/end time must be after/);
  });
  it('refuses a window over 7 days', async () => {
    await expect(allocateMachine({ ...ok, endsAt: new Date(START.getTime() + 8 * 24 * HOUR) })).rejects.toThrow(/at most 7 days/);
  });
  it('refuses an inactive, a deleted and an unknown machine', async () => {
    q.machine.mockResolvedValue({ id: 'm1', isActive: false, deletedAt: null });
    await expect(allocateMachine(ok)).rejects.toThrow(/switched off/);
    q.machine.mockResolvedValue({ id: 'm1', isActive: true, deletedAt: new Date() });
    await expect(allocateMachine(ok)).rejects.toThrow(/no longer exists/);
    q.machine.mockResolvedValue(null);
    await expect(allocateMachine(ok)).rejects.toThrow(/no longer exists/);
  });
  it.each(['DRAFT', 'CANCELLED', 'COMPLETED', 'DELIVERED'])('refuses an order that is %s', async (status) => {
    q.order.mockResolvedValue({ status });
    await expect(allocateMachine({ ...ok, orderId: 'o1' })).rejects.toThrow(/cannot be booked for it/);
  });
  it('takes the machine lock inside the transaction', async () => {
    await allocateMachine(ok);
    expect(q.locks).toHaveBeenCalledWith('machine-m1');
  });
  it('two overlapping bookings made at once: one is refused, as text', async () => {
    const taken: Row[] = [];
    q.overlap.mockImplementation(async () => taken[0] ?? null);
    q.create.mockImplementation(async ({ data }: Row) => {
      const row = { id: `a${taken.length + 1}`, ...data };
      taken.push(row);
      return row;
    });
    const results = await Promise.allSettled([allocateMachine(ok), allocateMachine(ok)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as Error).message).toMatch(/^Machine already allocated from /);
  });
});

describe('B99 board sync flag', () => {
  const machine = { id: 'm1', name: 'Press', code: 'P1', isActive: true, department: null };
  const live = { machineId: 'm1', orderId: 'o1', startsAt: IST('2026-10-13', '06:00'), endsAt: IST('2026-10-13', '14:00'), releasedAt: null, order: { orderNumber: 'ORD-1' }, jobPhase: null, workerAllocations: [] };

  beforeEach(() => {
    fakeDb.misMachine.findMany = async () => [machine];
  });

  it('flags a log for another order and shows the last log', async () => {
    q.allocFindMany.mockResolvedValue([live]);
    q.logs.mockResolvedValue([{ machineId: 'm1', orderId: 'o2', loggedAt: IST('2026-10-13', '09:00'), order: { orderNumber: 'ORD-2' } }]);
    const [m] = await getMachineBoard();
    expect(m.syncFlag).toBe('OTHER_ORDER');
    expect(m.lastLog).toMatchObject({ orderNumber: 'ORD-2' });
  });
  it('is OK when the log matches, and null with no log today; nothing is blocked either way', async () => {
    q.allocFindMany.mockResolvedValue([live]);
    q.logs.mockResolvedValue([{ machineId: 'm1', orderId: 'o1', loggedAt: IST('2026-10-13', '09:00'), order: { orderNumber: 'ORD-1' } }]);
    expect((await getMachineBoard())[0].syncFlag).toBe('OK');
    q.logs.mockResolvedValue([]);
    const [m] = await getMachineBoard();
    expect(m.syncFlag).toBeNull();
    expect(m.lastLog).toBeNull();
  });
  it('NO_BOOKING when the booking was released before the log', async () => {
    q.allocFindMany.mockResolvedValue([{ ...live, releasedAt: IST('2026-10-13', '07:00') }]);
    q.logs.mockResolvedValue([{ machineId: 'm1', orderId: 'o1', loggedAt: IST('2026-10-13', '09:00'), order: { orderNumber: 'ORD-1' } }]);
    expect((await getMachineBoard())[0].syncFlag).toBe('NO_BOOKING');
  });
  it('carries the crew names of the current booking for the release confirmation', async () => {
    q.allocFindMany.mockResolvedValue([{ ...live, workerAllocations: [{ employee: { name: 'Ramesh' } }, { employee: { name: 'Suresh' } }] }]);
    const [m] = await getMachineBoard();
    expect(m.currentAllocation?.crewNames).toEqual(['Ramesh', 'Suresh']);
  });
});

describe('B100 crew summary and B95 badge', () => {
  const pool = ['e1', 'e2', 'e3', 'e4'].map((id) => ({ id, name: id, employeeCode: id }));
  beforeEach(() => {
    q.employees.mockResolvedValue(pool);
    q.attendance.mockResolvedValue([
      { employeeId: 'e1', status: 'PRESENT', clockIn: IST('2026-10-13', '06:00'), clockOut: null },
      { employeeId: 'e2', status: 'PRESENT', clockIn: IST('2026-10-13', '06:00'), clockOut: null },
      { employeeId: 'e3', status: 'PRESENT', clockIn: IST('2026-10-13', '06:00'), clockOut: IST('2026-10-13', '10:00') },
    ]);
    q.workers.mockResolvedValue([{ employeeId: 'e1' }]);
    q.allocFindMany.mockResolvedValue([
      { id: 'b1', _count: { workerAllocations: 1 } },
      { id: 'b2', _count: { workerAllocations: 0 } },
    ]);
  });

  it('on machines 1, free 1 (clocked-out is not free), unstaffed bookings 1', async () => {
    const s = await getCrewSummary();
    expect(s).toMatchObject({ headcount: 4, onMachines: 1, free: 1, unstaffedBookings: 1 });
  });
  it('at 00:30 IST it reads the new factory day', async () => {
    vi.setSystemTime(IST('2026-10-14', '00:30'));
    await getCrewSummary();
    const where = q.attendance.mock.calls[0][0].where;
    expect(where.date.toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
  it('the supervisor badge counts people who are IN with no machine', async () => {
    fakeDb.misShift.findMany = async () => [{ id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '14:00', isDefault: true, isActive: true }];
    q.workers.mockResolvedValue([]);
    const badges = await getNavBadges('u1', 'SUPERVISOR');
    // e1 and e2 are IN with no row; e3 is out; e4 never came.
    expect(badges).toEqual({ crew: 2 });
  });
});

const MONEY_KEY = /wage|rate|salary|amount|price|cost|pay|value|money/i;
function moneyKeys(v: unknown, path = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => moneyKeys(x, `${path}[${i}]`));
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.entries(v).flatMap(([k, x]) => (MONEY_KEY.test(k) ? [`${path}.${k}`] : []).concat(moneyKeys(x, `${path}.${k}`)));
  }
  return [];
}

describe('B103 getCrewForOrder', () => {
  it('groups names and codes by phase, machine, day and shift; no money keys', async () => {
    const row = (id: string, name: string, released: boolean) => ({
      id, jobPhaseId: 'ph1', allocationDate: new Date('2026-10-13T00:00:00Z'), releasedAt: released ? new Date() : null, createdAt: new Date(),
      employee: { name, employeeCode: `C-${name}` }, shift: { name: 'Shift 1' },
      jobPhase: { process: { name: 'Printing' } }, machineAllocation: { machine: { name: 'Heidelberg' }, jobPhase: null },
    });
    q.workers.mockResolvedValue([row('1', 'Ramesh', false), row('2', 'Suresh', true)]);
    const out = await getCrewForOrder('o1');
    expect(out).toEqual([
      {
        jobPhaseId: 'ph1', phaseName: 'Printing', machineName: 'Heidelberg', dateKey: '2026-10-13', shiftName: 'Shift 1',
        people: [{ name: 'Ramesh', employeeCode: 'C-Ramesh', released: false }, { name: 'Suresh', employeeCode: 'C-Suresh', released: true }],
      },
    ]);
    expect(moneyKeys(out)).toEqual([]);
  });
});

describe('B102 manpower report', () => {
  it('sums person-hours per order/phase to 1 dp, counts shift staffing, and has no money keys', async () => {
    q.employees.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    q.workers.mockResolvedValue([
      {
        employeeId: 'e1', machineAllocationId: 'b1', shiftId: 's1', createdAt: IST('2026-10-12', '12:00'), releasedAt: IST('2026-10-13', '10:00'),
        machineAllocation: { id: 'b1', endsAt: IST('2026-10-13', '14:00'), order: { orderNumber: 'ORD-1' }, jobPhase: { process: { name: 'Printing' } } }, jobPhase: null,
      },
    ]);
    q.attendance.mockResolvedValue([
      { employeeId: 'e1', shiftId: 's1', clockIn: IST('2026-10-13', '06:00'), clockOut: null, status: 'PRESENT' },
      { employeeId: 'e2', shiftId: null, clockIn: IST('2026-10-13', '06:30'), clockOut: null, status: 'PRESENT' },
    ]);
    q.allocFindMany.mockResolvedValue([
      { id: 'b1', startsAt: IST('2026-10-13', '06:00'), endsAt: IST('2026-10-13', '14:00') },
      { id: 'b2', startsAt: IST('2026-10-13', '06:00'), endsAt: IST('2026-10-13', '14:00') },
    ]);
    const r = await getManpowerReport('2026-10-13');
    expect(r.shifts[0]).toMatchObject({ allocated: 1, clockedIn: 2, idle: 1, unstaffedBookings: 1 });
    expect(r.phases).toEqual([{ orderNumber: 'ORD-1', phaseName: 'Printing', personHours: 4 }]);
    expect(moneyKeys(r)).toEqual([]);
  });
});
