import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newIdempotencyKey } from '@/lib/mis/offline/idempotency';

import { createFakeDb } from './offline-fake-db';

// C5 #18 — the BOM stage chosen on the production form travels in the payload and is saved.

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const fake = createFakeDb();
const stageFindFirst = vi.fn();
const stageFindMany = vi.fn();
const allocFindMany = vi.fn();
const dbWithStages = Object.assign(fake.db, {
  misBomStage: { findFirst: (...a: unknown[]) => stageFindFirst(...a), findMany: (...a: unknown[]) => stageFindMany(...a) },
});
dbWithStages.misMachineAllocation = Object.assign(dbWithStages.misMachineAllocation, {
  findMany: (...a: unknown[]) => allocFindMany(...a),
});
vi.mock('@/server/db', () => ({ db: dbWithStages }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const { submitProductionLog, getProductionFormContext } = await import('./production');

const ORDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MACHINE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STAGE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function entry(payload: Record<string, unknown> = {}) {
  return {
    key: newIdempotencyKey(),
    kind: 'production.log' as const,
    payload: { orderId: ORDER, machineId: MACHINE, qtyProduced: 10, ...payload },
    clientRecordedAt: new Date().toISOString(),
    deviceId: 'tablet-1',
    queuedBy: USER,
  } as Parameters<typeof submitProductionLog>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.queued.clear();
  fake.state.logs = [];
  fake.state.phases = [];
  fake.state.orders = new Map([[ORDER, { orderNumber: 'ORD-1', status: 'IN_PRODUCTION' }]]);
  fake.state.machines = new Map([[MACHINE, { name: 'Coater' }]]);
  fake.state.clearances = [{
    machineId: MACHINE, mode: 'MINUTES', orderId: ORDER, shiftId: null,
    clearedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 3_600_000),
  }];
  getCurrentUser.mockResolvedValue({ id: USER });
  getMisRole.mockResolvedValue('SUPERVISOR');
  stageFindFirst.mockResolvedValue({ id: STAGE });
});

describe('production payload carries bomStageId (#18)', () => {
  it('saves the stage on the log row', async () => {
    const out = await submitProductionLog(entry({ bomStageId: STAGE }));
    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.logs[0]).toMatchObject({ bomStageId: STAGE });
    expect(stageFindFirst.mock.calls[0][0].where).toEqual({ id: STAGE, bom: { orderId: ORDER } });
  });

  it('stays optional: no stage, no lookup, saved as before', async () => {
    const out = await submitProductionLog(entry());
    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.logs[0].bomStageId).toBeUndefined();
    expect(stageFindFirst).not.toHaveBeenCalled();
  });

  it('refuses a stage that is not a UUID', async () => {
    const out = await submitProductionLog(entry({ bomStageId: 'nope' }));
    expect(out).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
    expect(fake.state.logs).toHaveLength(0);
  });

  it("refuses a stage outside this order's BOM", async () => {
    stageFindFirst.mockResolvedValue(null);
    const out = await submitProductionLog(entry({ bomStageId: STAGE }));
    expect(out).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
    expect(fake.state.logs).toHaveLength(0);
  });
});

describe('getProductionFormContext (#18, #39/#43)', () => {
  it('returns the BOM stages and the distinct allocated machines', async () => {
    stageFindMany.mockResolvedValue([{ id: STAGE, stageName: 'Coat', seq: 1 }]);
    allocFindMany.mockResolvedValue([
      { machine: { id: MACHINE, name: 'Coater' } },
      { machine: { id: MACHINE, name: 'Coater' } },
    ]);
    const ctx = await getProductionFormContext(ORDER);
    expect(ctx.stages).toEqual([{ id: STAGE, stageName: 'Coat', seq: 1 }]);
    expect(ctx.machines).toEqual([{ id: MACHINE, name: 'Coater' }]);
    expect(allocFindMany.mock.calls[0][0].where).toMatchObject({ orderId: ORDER, releasedAt: null });
  });

  it('is gated on production.read', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    await expect(getProductionFormContext(ORDER)).rejects.toThrow(/Not permitted: production\.read/);
  });
});
