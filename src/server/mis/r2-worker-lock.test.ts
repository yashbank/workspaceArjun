/**
 * R2-47 HARD worker lock: the holder (assignedById), an Admin or the Owner releases / moves a
 * worker; nobody else. The crew board learns who holds each lock. Db-free.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/visibility', () => ({ resolveVisibleEmployeeWhere: async () => ({}) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const state: { rows: Row[]; released: string[] } = { rows: [], released: [] };
const tx = {
  misWorkerAllocation: {
    findFirst: async ({ where }: Row) => state.rows.find((r) => r.id === where.id) ?? null,
    findMany: async ({ where }: Row) =>
      state.rows.filter((r) => (where.id?.in ? where.id.in.includes(r.id) : true) && r.releasedAt === null),
    updateMany: async ({ where }: Row) => {
      for (const r of state.rows) if (where.id.in.includes(r.id)) { r.releasedAt = new Date(); state.released.push(r.id); }
      return { count: where.id.in.length };
    },
    create: async ({ data }: Row) => ({ id: 'new', ...data }),
  },
  misEmployee: { findMany: async () => [{ id: 'e1' }] },
  misMachineAllocation: { findUnique: async () => ({ id: 'ma-2', releasedAt: null, endsAt: new Date(Date.now() + 3_600_000), jobPhaseId: null }) },
  misShift: { findFirst: async () => null },
  $queryRaw: async () => [],
};
vi.mock('@/server/db', () => ({
  db: {
    ...tx,
    userProfile: { findMany: async ({ where }: Row) => where.id.in.map((id: string) => ({ id, name: id === 'supA' ? 'Supervisor A' : 'Someone' })) },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

const { releaseWorker, moveWorker, getWorkerLocks } = await import('./worker-allocation');

const row = (over: Row = {}) => ({
  id: 'w1', employeeId: 'e1', machineAllocationId: 'ma-1', shiftId: null, allocationDate: new Date('2026-10-19T00:00:00Z'),
  assignedById: 'supA', releasedAt: null, deletedAt: null, ...over,
});
const as = (role: string, id: string) => {
  getCurrentUser.mockResolvedValue({ id });
  getMisRole.mockResolvedValue(role);
};

beforeEach(() => {
  state.rows = [row()];
  state.released = [];
  audit.mockClear();
});

describe('R2-47 release / move', () => {
  it('another supervisor (not the holder) cannot release, and is told who holds the worker', async () => {
    as('SUPERVISOR', 'supB');
    await expect(releaseWorker('w1')).rejects.toThrow('Only Supervisor A (who assigned this person), an Admin or the Owner can release them.');
    expect(state.released).toEqual([]);
  });
  it('another supervisor cannot move them either', async () => {
    as('SUPERVISOR', 'supB');
    await expect(moveWorker({ workerAllocationId: 'w1', toMachineAllocationId: 'ma-2' })).rejects.toThrow(/Only Supervisor A/);
    expect(state.released).toEqual([]);
  });
  it('the holder releases', async () => {
    as('SUPERVISOR', 'supA');
    await releaseWorker('w1');
    expect(state.released).toEqual(['w1']);
  });
  it.each(['ADMIN', 'OWNER'])('%s releases a worker they did not assign', async (role) => {
    as(role, 'boss');
    await releaseWorker('w1');
    expect(state.released).toEqual(['w1']);
  });
  it('a row with no recorded holder (before the lock) is releasable by a supervisor', async () => {
    state.rows = [row({ assignedById: null })];
    as('SUPERVISOR', 'supB');
    await releaseWorker('w1');
    expect(state.released).toEqual(['w1']);
  });
  it.each(['QC', 'WORKER', 'STORE_GUY'])('%s is forbidden (production.write)', async (role) => {
    as(role, 'x');
    await expect(releaseWorker('w1')).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});

describe('R2-47 getWorkerLocks', () => {
  it('names the holder and says who may release', async () => {
    as('SUPERVISOR', 'supB');
    state.rows = [row(), row({ id: 'w2', assignedById: 'supB' })];
    const locks = await getWorkerLocks('s1', '2026-10-19');
    expect(locks).toEqual({
      w1: { holderName: 'Supervisor A', canRelease: false },
      w2: { holderName: 'Someone', canRelease: true },
    });
  });
  it('an Admin may release every lock', async () => {
    as('ADMIN', 'boss');
    const locks = await getWorkerLocks('s1', '2026-10-19');
    expect(locks.w1.canRelease).toBe(true);
  });
  it.each(['ATTENDANCE_OPERATOR', 'STORE_GUY', 'WORKER'])('%s is forbidden (production.read)', async (role) => {
    as(role, 'x');
    await expect(getWorkerLocks('s1', '2026-10-19')).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
  it('refuses a bad date', async () => {
    as('SUPERVISOR', 'supA');
    await expect(getWorkerLocks('s1', '19/10/2026')).rejects.toThrow(/not valid/);
  });
});
