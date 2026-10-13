/**
 * R3-WRK: the worker allocation engine against a small in-memory database, so release, move,
 * locking, atomicity and validation are proved on state, not on call counts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const IST = (key: string, hhmm: string) => new Date(`${key}T${hhmm}:00+05:30`);

const state = {
  machineAllocs: [] as Row[],
  workers: [] as Row[],
  audit: [] as Row[],
  employees: [] as Row[],
  attendance: [] as Row[],
  leaves: [] as Row[],
  shifts: [] as Row[],
  locks: [] as string[],
  nextId: 1,
  failOnCreate: 0,
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Row[]).every((c) => matches(row, c));
    if (key === 'machineAllocation') return true; // relation filters are exercised in the pure tests
    const v = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(v);
      if ('not' in cond) return v !== cond.not;
      if ('lt' in cond) return v < cond.lt;
      if ('gt' in cond) return v > cond.gt;
      if ('gte' in cond) return v >= cond.gte;
      return true;
    }
    if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
    return v === cond;
  });
}

const table = (name: 'machineAllocs' | 'workers') => ({
  findUnique: async ({ where }: Row) => state[name].find((r) => r.id === where.id) ?? null,
  findFirst: async ({ where }: Row) => state[name].find((r) => matches(r, where)) ?? null,
  findMany: async ({ where }: Row = {}) => state[name].filter((r) => matches(r, where)),
  updateMany: async ({ where, data }: Row) => {
    const hit = state[name].filter((r) => matches(r, where));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  },
});

const withMachine = (r: Row) => ({ ...r, machine: { id: r.machineId, name: r.machineName }, order: null, jobPhase: null });
const fakeTx = {
  misMachineAllocation: {
    ...table('machineAllocs'),
    findMany: async ({ where }: Row = {}) => state.machineAllocs.filter((r) => matches(r, where)).map(withMachine),
  },
  misWorkerAllocation: {
    ...table('workers'),
    findMany: async ({ where }: Row = {}) =>
      state.workers
        .filter((r) => matches(r, where))
        .map((r) => ({ ...r, machineAllocation: withMachine(state.machineAllocs.find((m) => m.id === r.machineAllocationId)!) })),
    findFirst: async ({ where }: Row) => {
      const r = state.workers.find((w) => matches(w, where));
      const ma = r && state.machineAllocs.find((m) => m.id === r.machineAllocationId);
      return r ? { ...r, machineAllocation: { machine: { name: ma?.machineName ?? 'M' }, order: null }, jobPhase: null } : null;
    },
    create: async ({ data }: Row) => {
      if (state.failOnCreate > 0 && state.workers.filter((w) => w._new).length + 1 === state.failOnCreate) throw new Error('boom');
      const row = { id: `wa-${state.nextId++}`, releasedAt: null, deletedAt: null, createdAt: new Date(), _new: true, ...data };
      state.workers.push(row);
      return row;
    },
  },
  misEmployee: {
    findMany: async ({ where }: Row) => state.employees.filter((e) => matches(e, where)),
  },
  misAttendance: { findMany: async ({ where }: Row) => state.attendance.filter((r) => matches(r, where)) },
  misLeaveRequest: { findMany: async ({ where }: Row) => state.leaves.filter((r) => matches(r, where)) },
  misShift: { findFirst: async ({ where }: Row) => state.shifts.find((s) => matches(s, where)) ?? null, findMany: async () => state.shifts },
  misJobPhase: { findFirst: async () => null },
  misAuditLog: {
    create: async ({ data }: Row) => {
      state.audit.push(data);
      return data;
    },
  },
  $queryRaw: async (_s: TemplateStringsArray, key: string) => {
    state.locks.push(key);
    return [];
  },
};

// Transactions run one at a time: that is what the per-person advisory lock guarantees for the same keys.
let chain: Promise<unknown> = Promise.resolve();
const fakeDb = {
  ...fakeTx,
  // Rollback on throw: restore the snapshot, as a real transaction would.
  $transaction: (fn: (tx: typeof fakeTx) => unknown) => {
    const run = chain.then(() => runTx(fn));
    chain = run.catch(() => undefined);
    return run;
  },
};
async function runTx(fn: (tx: typeof fakeTx) => unknown) {
  {
    const snap = { workers: state.workers.map((r) => ({ ...r })), audit: [...state.audit], machineAllocs: state.machineAllocs.map((r) => ({ ...r })) };
    try {
      return await fn(fakeTx);
    } catch (error) {
      state.workers = snap.workers;
      state.audit = snap.audit;
      state.machineAllocs = snap.machineAllocs;
      throw error;
    }
  }
}
vi.mock('@/server/db', () => ({ db: fakeDb }));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/visibility', () => ({ resolveVisibleEmployeeWhere: async () => ({}) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async (row: Row) => { state.audit.push(row); } }));

const { releaseMachine } = await import('./machines-board');
const { assignWorkers, releaseWorker, moveWorker, copyCrew, getWorkerAvailability, listCrewBookings } = await import('./worker-allocation');
const { releaseMachineAllocations, releaseWorkerRows } = await import('./allocation-release');

const SHIFT = { id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '14:00', isActive: true, isDefault: true };
const NIGHT = { id: 's3', name: 'Night', startTime: '22:00', endTime: '06:00', isActive: true, isDefault: false };
// "now" is 2026-10-13 10:30 IST, inside the day shift.
const NOW = IST('2026-10-13', '10:30');
const TOMORROW = '2026-10-14';

const machineAlloc = (id: string, over: Row = {}) => ({
  id, machineId: `m-${id}`, machineName: `Machine ${id}`, orderId: 'o1', jobPhaseId: null, releasedAt: null,
  startsAt: IST('2026-10-14', '06:00'), endsAt: IST('2026-10-14', '14:00'), ...over,
});
const worker = (id: string, employeeId: string, machineAllocationId: string, over: Row = {}) => ({
  id, employeeId, machineAllocationId, shiftId: 's1', allocationDate: new Date('2026-10-14T00:00:00Z'),
  releasedAt: null, deletedAt: null, createdAt: IST('2026-10-13', '09:00'), ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.assign(state, {
    machineAllocs: [machineAlloc('ma-1'), machineAlloc('ma-2')],
    workers: [], audit: [], locks: [], attendance: [], leaves: [], failOnCreate: 0, nextId: 1,
    shifts: [SHIFT, NIGHT],
    employees: ['e1', 'e2', 'e3', 'e4'].map((id) => ({ id, name: `Name ${id}`, employeeCode: id.toUpperCase(), role: 'WORKER', isActive: true, deletedAt: null })),
  });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('SUPERVISOR');
});

const auditActions = () => state.audit.map((a) => a.action);

describe('B85 releaseMachine', () => {
  beforeEach(() => {
    state.machineAllocs = [machineAlloc('ma-1', { startsAt: IST('2026-10-13', '06:00'), endsAt: IST('2026-10-13', '14:00') })];
    state.workers = ['e1', 'e2', 'e3'].map((e, i) => worker(`w${i}`, e, 'ma-1'));
  });

  it('frees the 3 open worker rows with the machine releasedAt', async () => {
    const res = await releaseMachine('ma-1');
    expect(res).toMatchObject({ alreadyReleased: false, workers: 3 });
    const at = state.machineAllocs[0].releasedAt;
    expect(at).toBeInstanceOf(Date);
    expect(state.workers.map((w) => w.releasedAt)).toEqual([at, at, at]);
    expect(auditActions().filter((a) => a === 'RELEASE_WORKER')).toHaveLength(3);
    expect(state.audit.find((a) => a.action === 'RELEASE_MACHINE')!.after).toMatchObject({ reason: 'MACHINE_RELEASED' });
  });

  it('a second release is alreadyReleased and changes no timestamp', async () => {
    await releaseMachine('ma-1');
    const first = state.machineAllocs[0].releasedAt;
    vi.setSystemTime(new Date(NOW.getTime() + 3600_000));
    const again = await releaseMachine('ma-1');
    expect(again.alreadyReleased).toBe(true);
    expect(state.machineAllocs[0].releasedAt).toBe(first);
  });

  it('a worker row released earlier keeps its original releasedAt', async () => {
    const earlier = new Date('2026-10-13T03:00:00Z');
    state.workers[0].releasedAt = earlier;
    await releaseMachine('ma-1');
    expect(state.workers[0].releasedAt).toBe(earlier);
    expect(auditActions().filter((a) => a === 'RELEASE_WORKER')).toHaveLength(2);
  });

  it('an unknown id is a typed not-found', async () => {
    await expect(releaseMachine('nope')).rejects.toMatchObject({ name: 'AllocationNotFoundError' });
  });

  it('the shared helpers touch only open rows and refuse an empty filter', async () => {
    const tx = fakeTx as never;
    expect(await releaseWorkerRows(tx, {}, { reason: 'MANUAL', actorUserId: null, at: NOW })).toEqual({ workerAllocationIds: [] });
    expect(await releaseMachineAllocations(tx, [], { reason: 'ORDER_CLOSED', actorUserId: null, at: NOW })).toEqual({ machines: 0, workers: 0, workerAllocationIds: [] });
    expect(state.workers.every((w) => w.releasedAt === null)).toBe(true);
  });
});

describe('B88 date keys', () => {
  it('at 01:00 IST on the 14th the default date key is the 14th, equal to the attendance date', async () => {
    vi.setSystemTime(new Date('2026-10-13T19:30:00Z'));
    state.machineAllocs = [machineAlloc('ma-1', { startsAt: IST('2026-10-14', '06:00'), endsAt: IST('2026-10-14', '14:00') })];
    await assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e1'], shiftId: 's1', confirmWarnings: true });
    expect(state.workers[0].allocationDate.toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
});

describe('B87 several rows per person and Move', () => {
  it('returns every open row of a person', async () => {
    state.workers = [worker('w1', 'e1', 'ma-1'), worker('w2', 'e1', 'ma-2')];
    state.machineAllocs = [machineAlloc('ma-1'), machineAlloc('ma-2')];
    const rows = await getWorkerAvailability('s1', TOMORROW);
    expect(rows.find((r) => r.employeeId === 'e1')!.allocations.map((a) => a.id).sort()).toEqual(['w1', 'w2']);
  });

  it('Move releases the old row with reason MOVED, opens the new one, count unchanged', async () => {
    state.workers = [worker('w1', 'e1', 'ma-1')];
    await moveWorker({ workerAllocationId: 'w1', toMachineAllocationId: 'ma-2' });
    expect(state.workers.find((w) => w.id === 'w1')!.releasedAt).toBeInstanceOf(Date);
    const open = state.workers.filter((w) => !w.releasedAt);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ employeeId: 'e1', machineAllocationId: 'ma-2', shiftId: 's1' });
    expect(state.audit.find((a) => a.action === 'RELEASE_WORKER')!.after.reason).toBe('MOVED');
  });
});

describe('B91 atomic and locked', () => {
  it('takes one sorted lock per person, shift and day before any write', async () => {
    await assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e3', 'e1'], shiftId: 's1', allocationDate: TOMORROW });
    expect(state.locks).toEqual([`worker-e1-${TOMORROW}-s1`, `worker-e3-${TOMORROW}-s1`]);
  });

  it('two identical assigns leave exactly one row', async () => {
    const input = { machineAllocationId: 'ma-1', employeeIds: ['e1'], shiftId: 's1', allocationDate: TOMORROW };
    await Promise.all([assignWorkers(input), assignWorkers(input)]);
    expect(state.workers.filter((w) => w.employeeId === 'e1')).toHaveLength(1);
  });

  it('a crash on the 2nd create leaves zero rows (and no audit)', async () => {
    state.failOnCreate = 2;
    await expect(
      assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e1', 'e2'], shiftId: 's1', allocationDate: TOMORROW }),
    ).rejects.toThrow('boom');
    expect(state.workers).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });
});

describe('B92 validation', () => {
  const base = { machineAllocationId: 'ma-1', employeeIds: ['e1'], shiftId: 's1', allocationDate: TOMORROW };

  it('refuses an empty list', async () => {
    await expect(assignWorkers({ ...base, employeeIds: [] })).rejects.toThrow(/at least one/);
  });
  it('refuses a person outside the pool, listing the ids', async () => {
    await expect(assignWorkers({ ...base, employeeIds: ['e1', 'ghost'] })).rejects.toThrow('Not found or not in your team: ghost');
  });
  it('refuses an inactive or deleted person and a non-workable role', async () => {
    state.employees[0].isActive = false;
    await expect(assignWorkers(base)).rejects.toThrow(/Not found or not in your team: e1/);
    state.employees[0].isActive = true;
    state.employees[0].role = 'ADMIN';
    await expect(assignWorkers(base)).rejects.toThrow(/Not found or not in your team: e1/);
  });
  it('refuses an inactive shift', async () => {
    state.shifts = [{ ...SHIFT, isActive: false }];
    await expect(assignWorkers(base)).rejects.toThrow('That shift is not active.');
  });
  it('refuses a date 8 days ahead, a past day and a malformed key', async () => {
    await expect(assignWorkers({ ...base, allocationDate: '2026-10-21' })).rejects.toThrow(/today to 7 days/);
    await expect(assignWorkers({ ...base, allocationDate: '2026-10-12' })).rejects.toThrow(/today to 7 days/);
    await expect(assignWorkers({ ...base, allocationDate: '14/10/2026' })).rejects.toThrow(/not valid/);
  });
  it('accepts +7', async () => {
    state.machineAllocs = [machineAlloc('ma-1', { startsAt: IST('2026-10-20', '06:00'), endsAt: IST('2026-10-20', '14:00') })];
    const res = await assignWorkers({ ...base, allocationDate: '2026-10-20' });
    expect(res.created).toHaveLength(1);
  });
  it('refuses a booking that does not run in that shift on that date', async () => {
    await expect(assignWorkers({ ...base, shiftId: 's3' })).rejects.toThrow(/does not run during this shift/);
  });
  it('refuses a phase different from the booked one', async () => {
    state.machineAllocs = [machineAlloc('ma-1', { jobPhaseId: 'ph-1' })];
    await expect(assignWorkers({ ...base, jobPhaseId: 'ph-2' })).rejects.toThrow(/not the one booked/);
  });
  it('releaseWorker: an already released row is refused', async () => {
    state.workers = [worker('w1', 'e1', 'ma-1', { releasedAt: NOW })];
    await expect(releaseWorker('w1')).rejects.toThrow('Already released.');
  });
  it('releaseWorker: pool-checked, reason MANUAL, audit has before', async () => {
    state.workers = [worker('w1', 'e1', 'ma-1')];
    await releaseWorker('w1');
    const a = state.audit.find((x) => x.action === 'RELEASE_WORKER');
    expect(a!.after.reason).toBe('MANUAL');
    expect(a!.before).toMatchObject({ releasedAt: null });
    state.workers = [worker('w9', 'ghost', 'ma-1')];
    await expect(releaseWorker('w9')).rejects.toThrow(/not in your team/);
  });
});

describe('B93 bookings per shift and copyCrew', () => {
  it('a booking 18:00-02:00 shows under the 22:00 shift on its start date only', async () => {
    state.machineAllocs = [machineAlloc('ma-n', { startsAt: IST('2026-10-14', '18:00'), endsAt: IST('2026-10-15', '02:00') })];
    expect((await listCrewBookings('2026-10-14', 's3')).map((b) => b.machineAllocationId)).toEqual(['ma-n']);
    expect(await listCrewBookings('2026-10-13', 's3')).toHaveLength(0);
    expect(await listCrewBookings('2026-10-14', 's1')).toHaveLength(0);
  });

  it('copyCrew copies 3 people for the same booking id and skips 1 on leave', async () => {
    state.machineAllocs = [machineAlloc('ma-1', { startsAt: IST('2026-10-14', '06:00'), endsAt: IST('2026-10-15', '14:00') })];
    state.workers = ['e1', 'e2', 'e3', 'e4'].map((e, i) => worker(`w${i}`, e, 'ma-1', { allocationDate: new Date('2026-10-13T00:00:00Z'), releasedAt: IST('2026-10-13', '14:00') }));
    state.leaves = [{ employeeId: 'e4', date: new Date('2026-10-14T00:00:00Z'), status: 'APPROVED' }];
    const res = await copyCrew({ fromDateKey: '2026-10-13', toDateKey: TOMORROW, shiftId: 's1' });
    expect(res.copied).toBe(3);
    expect(res.skipped).toEqual([{ employeeId: 'e4', name: 'Name e4', reason: 'ON_LEAVE' }]);
  });
});
