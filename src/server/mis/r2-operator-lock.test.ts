import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { newIdempotencyKey } from '@/lib/mis/offline/idempotency';

import { createFakeDb } from './offline-fake-db';

// R2-47 HARD worker lock on the production log: an operator held (open crew row) on machine A
// is not accepted as the operator of a log on machine B in the same shift - on the queued submit,
// the direct logProduction path and an edit that changes the operator. The refusal names the
// machine and the holder. Same operator on the machine that holds them is fine.

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', async (orig) => ({
  ...(await orig<typeof import('@/server/mis/business-rules')>()),
  getFactoryTimezone: async () => 'Asia/Kolkata',
}));

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const fake = createFakeDb();
const holds: Row[] = [];
const workerFindMany = vi.fn(async ({ where }: Row) =>
  holds.filter(
    (h) =>
      h.employeeId === where.employeeId &&
      h.allocationDate.getTime() === where.allocationDate.getTime() &&
      (where.shiftId === undefined || h.shiftId === where.shiftId) &&
      h.machineAllocation.machineId !== where.machineAllocation.machineId.not,
  ),
);
const logFindUnique = vi.fn();
const logUpdate = vi.fn(async ({ data }: Row) => ({ id: 'log-x', unit: 'KG', ...data }));
const dbX = Object.assign(fake.db, {
  misEmployee: Object.assign(fake.db.misEmployee, {
    findUnique: async ({ where }: Row) => ({ id: where.id, name: 'Ramesh', isActive: true, deletedAt: null }),
  }),
  misWorkerAllocation: { findFirst: async () => ({ id: 'w-any' }), findMany: workerFindMany },
  userProfile: {
    findMany: async ({ where }: Row) => where.id.in.map((id: string) => ({ id, name: id === 'supA' ? 'Supervisor A' : 'Someone' })),
  },
});
dbX.misMachine = { findUnique: async ({ where }: Row) => ({ id: where.id, name: where.id === MACHINE_B ? 'Coater 2' : 'Coater 1', isActive: true, deletedAt: null }) };
dbX.misProductionLog = Object.assign(dbX.misProductionLog, {
  findUnique: (...a: unknown[]) => logFindUnique(...a),
  update: (...a: unknown[]) => logUpdate(...(a as [Row])),
});
vi.mock('@/server/db', () => ({ db: dbX }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const { submitProductionLog, logProduction, editProductionLog } = await import('./production');

const ORDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MACHINE_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MACHINE_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EMP = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const today = () => dateKeyToDbDate(factoryDateKey(new Date(), 'Asia/Kolkata'));
const holdOn = (machineId: string, name: string, over: Row = {}) => ({
  id: 'w-hold',
  employeeId: EMP,
  allocationDate: today(),
  shiftId: null,
  assignedById: 'supA',
  machineAllocation: { machineId, machine: { name } },
  ...over,
});

function entry(payload: Row = {}) {
  return {
    key: newIdempotencyKey(),
    kind: 'production.log' as const,
    payload: { orderId: ORDER, machineId: MACHINE_B, qtyProduced: 10, employeeId: EMP, ...payload },
    clientRecordedAt: new Date().toISOString(),
    deviceId: 'tablet-1',
    queuedBy: USER,
  } as Parameters<typeof submitProductionLog>[0];
}

const as = (role: string) => getMisRole.mockResolvedValue(role);

beforeEach(() => {
  vi.clearAllMocks();
  holds.length = 0;
  fake.state.queued.clear();
  fake.state.logs = [];
  fake.state.phases = [];
  fake.state.shifts = [];
  fake.state.allocations = [];
  fake.state.orders = new Map([[ORDER, { orderNumber: 'ORD-1', status: 'IN_PRODUCTION' }]]);
  fake.state.machines = new Map([
    [MACHINE_A, { name: 'Coater 1' }],
    [MACHINE_B, { name: 'Coater 2' }],
  ]);
  const clearance = (machineId: string) => ({
    machineId, mode: 'MINUTES', orderId: ORDER, shiftId: null, clearedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 3_600_000),
  });
  fake.state.clearances = [clearance(MACHINE_A), clearance(MACHINE_B)];
  getCurrentUser.mockResolvedValue({ id: USER });
  as('SUPERVISOR');
});

describe('R2-47 production-log operator vs the worker lock (submit path)', () => {
  it('an operator held on machine A is not accepted on machine B; the message names machine + holder', async () => {
    holds.push(holdOn(MACHINE_A, 'Coater 1'));
    const out = await submitProductionLog(entry(), { live: true });
    expect(out.outcome).toBe('PARKED');
    expect(out.reason).toBe('WORKER_LOCKED');
    expect(out.detail).toContain('Coater 1');
    expect(out.detail).toContain('Supervisor A');
    expect(fake.state.logs).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it('the lookup is the open, unreleased, still-running crew row on ANOTHER machine for that day', async () => {
    await submitProductionLog(entry(), { live: true });
    const where = workerFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      employeeId: EMP,
      allocationDate: today(),
      releasedAt: null,
      deletedAt: null,
      machineAllocation: { releasedAt: null, machineId: { not: MACHINE_B } },
    });
    expect(where.machineAllocation.endsAt.gte).toBeInstanceOf(Date);
  });

  it('the same operator on the machine that holds them is logged', async () => {
    holds.push(holdOn(MACHINE_B, 'Coater 2'));
    const out = await submitProductionLog(entry(), { live: true });
    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.logs).toHaveLength(1);
  });

  it('an operator with no hold anywhere is logged', async () => {
    const out = await submitProductionLog(entry(), { live: true });
    expect(out.outcome).toBe('APPLIED');
  });

  it('a log with no operator is not checked', async () => {
    holds.push(holdOn(MACHINE_A, 'Coater 1'));
    const out = await submitProductionLog(entry({ employeeId: undefined }), { live: true });
    expect(out.outcome).toBe('APPLIED');
    expect(workerFindMany).not.toHaveBeenCalled();
  });

  it('a hold in a DIFFERENT shift does not block (same shift only)', async () => {
    // Every minute of the day sits in the "all" shift, so the log resolves to it.
    fake.state.shifts = [{ id: 'all', isActive: true, startTime: '00:00', endTime: '23:59' }];
    holds.push(holdOn(MACHINE_A, 'Coater 1', { shiftId: 'night' }));
    const out = await submitProductionLog(entry(), { live: true });
    expect(workerFindMany.mock.calls[0][0].where.shiftId).toBe('all');
    expect(out.outcome).toBe('APPLIED');
  });

  it('a hold in the SAME shift blocks', async () => {
    fake.state.shifts = [{ id: 'all', isActive: true, startTime: '00:00', endTime: '23:59' }];
    holds.push(holdOn(MACHINE_A, 'Coater 1', { shiftId: 'all' }));
    const out = await submitProductionLog(entry(), { live: true });
    expect(out.outcome).toBe('PARKED');
    expect(out.reason).toBe('WORKER_LOCKED');
  });

  it.each(['ADMIN', 'OWNER'])('%s cannot log a held operator on another machine either (release first)', async (role) => {
    as(role);
    holds.push(holdOn(MACHINE_A, 'Coater 1'));
    const out = await submitProductionLog(entry(), { live: true });
    expect(out.outcome).toBe('PARKED');
    expect(out.reason).toBe('WORKER_LOCKED');
  });

  it('a hold with no recorded holder still blocks and says "another supervisor"', async () => {
    holds.push(holdOn(MACHINE_A, 'Coater 1', { assignedById: null }));
    const out = await submitProductionLog(entry(), { live: true });
    expect(out.reason).toBe('WORKER_LOCKED');
    expect(out.detail).toContain('another supervisor');
  });

  it.each(['QC', 'WORKER', 'STORE_GUY'])('%s cannot log production at all (production.write)', async (role) => {
    as(role);
    const out = await submitProductionLog(entry(), { live: true });
    expect(out.outcome).not.toBe('APPLIED');
    expect(fake.state.logs).toHaveLength(0);
  });
});

describe('R2-47 production-log operator vs the worker lock (direct and edit paths)', () => {
  it('logProduction refuses a held operator with the machine + holder message', async () => {
    holds.push(holdOn(MACHINE_A, 'Coater 1'));
    await expect(
      logProduction({ orderId: ORDER, machineId: MACHINE_B, qtyProduced: 5, employeeId: EMP }),
    ).rejects.toThrow(/allocated to Coater 1 .*held by Supervisor A/);
    expect(fake.state.logs).toHaveLength(0);
  });

  const existingLog = (over: Row = {}) => ({
    id: 'log-x', orderId: ORDER, machineId: MACHINE_B, employeeId: null, shiftId: null, bomStageId: null, unit: 'KG',
    qtyProduced: 5, qtyWaste: 0, loggedAt: new Date(), loggedById: USER, voidedAt: null,
    jobPhase: null, order: { status: 'IN_PRODUCTION' }, ...over,
  });

  it('an edit that names a held operator on another machine is refused and nothing is written', async () => {
    as('ADMIN');
    logFindUnique.mockResolvedValue(existingLog());
    holds.push(holdOn(MACHINE_A, 'Coater 1'));
    await expect(editProductionLog('log-x', { reason: 'wrong operator', employeeId: EMP })).rejects.toThrow(/Coater 1.*Supervisor A/);
    expect(logUpdate).not.toHaveBeenCalled();
  });

  it('an edit that moves the log to another machine than the one holding its operator is refused', async () => {
    as('ADMIN');
    logFindUnique.mockResolvedValue(existingLog({ machineId: MACHINE_A, employeeId: EMP }));
    holds.push(holdOn(MACHINE_A, 'Coater 1'));
    await expect(editProductionLog('log-x', { reason: 'wrong machine', machineId: MACHINE_B })).rejects.toThrow(/Coater 1/);
    expect(logUpdate).not.toHaveBeenCalled();
  });

  it('an edit that only fixes quantities is not re-checked', async () => {
    as('ADMIN');
    logFindUnique.mockResolvedValue(existingLog({ employeeId: EMP }));
    holds.push(holdOn(MACHINE_A, 'Coater 1'));
    await editProductionLog('log-x', { reason: 'typo fix', qtyProduced: 6 });
    expect(workerFindMany).not.toHaveBeenCalled();
    expect(logUpdate).toHaveBeenCalled();
  });
});
