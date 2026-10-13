import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newIdempotencyKey } from '@/lib/mis/offline/idempotency';

import { createFakeDb } from './offline-fake-db';

// R3-PRD: B113 (DRAFT parks), B114 (a resolved row is never applied), B121 (clearance is per order,
// inactive machine), B122 (operator / shift / crew warning), B123 (booking warning).

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const fake = createFakeDb();
const employeeFindUnique = vi.fn();
const workerFindFirst = vi.fn();
const allocFindMany = vi.fn();
const machineFindUnique = vi.fn();
const dbX = Object.assign(fake.db, {
  misEmployee: Object.assign(fake.db.misEmployee, { findUnique: (...a: unknown[]) => employeeFindUnique(...a) }),
  misWorkerAllocation: { findFirst: (...a: unknown[]) => workerFindFirst(...a) },
});
dbX.misMachineAllocation = Object.assign(dbX.misMachineAllocation, { findMany: (...a: unknown[]) => allocFindMany(...a) });
dbX.misMachine = { findUnique: (...a: unknown[]) => machineFindUnique(...a) };
vi.mock('@/server/db', () => ({ db: dbX }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const { submitProductionLog } = await import('./production');
const { discardParkedWrite } = await import('./idempotency');
const { assertLineCleared } = await import('./line-clearance');

const ORDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORDER = '99999999-9999-4999-8999-999999999999';
const MACHINE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EMP = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function entry(payload: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return {
    key: newIdempotencyKey(),
    kind: 'production.log' as const,
    payload: { orderId: ORDER, machineId: MACHINE, qtyProduced: 10, ...payload },
    clientRecordedAt: new Date().toISOString(),
    deviceId: 'tablet-1',
    queuedBy: USER,
    ...over,
  } as Parameters<typeof submitProductionLog>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.queued.clear();
  fake.state.logs = [];
  fake.state.phases = [];
  fake.state.shifts = [];
  fake.state.orders = new Map([[ORDER, { orderNumber: 'ORD-1', status: 'IN_PRODUCTION' }]]);
  fake.state.machines = new Map([[MACHINE, { name: 'Coater 1' }]]);
  fake.state.clearances = [
    { machineId: MACHINE, mode: 'MINUTES', orderId: ORDER, shiftId: null, clearedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 3_600_000) },
  ];
  getCurrentUser.mockResolvedValue({ id: USER });
  getMisRole.mockResolvedValue('SUPERVISOR');
  employeeFindUnique.mockResolvedValue({ id: EMP, isActive: true, deletedAt: null });
  workerFindFirst.mockResolvedValue({ id: 'w1' });
  allocFindMany.mockResolvedValue([]);
  machineFindUnique.mockResolvedValue({ name: 'Coater 1', isActive: true, deletedAt: null });
});

const booking = (orderId: string, orderNumber: string) => ({
  machineId: MACHINE, orderId, startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 3_600_000),
  releasedAt: null, order: { orderNumber }, machine: { name: 'Coater 1' },
});

describe('B113 a DRAFT order is not started', () => {
  it('a live submit on DRAFT is refused and records nothing', async () => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-1', status: 'DRAFT' });
    const out = await submitProductionLog(entry(), { live: true });
    expect(out.outcome).toBe('PARKED');
    expect(out.reason).toBe('ORDER_NOT_STARTED');
    expect(out.detail).toBe('Order ORD-1 is not confirmed yet.');
    expect(fake.state.logs).toHaveLength(0);
    expect(fake.state.queued.size).toBe(0);
  });

  it('an offline replay on DRAFT is PARKED with ORDER_NOT_STARTED', async () => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-1', status: 'DRAFT' });
    const e = entry();
    const out = await submitProductionLog(e);
    expect(out).toMatchObject({ outcome: 'PARKED', reason: 'ORDER_NOT_STARTED' });
    expect(fake.state.queued.get(e.key)?.status).toBe('PARKED');
  });

  it.each(['CONFIRMED', 'IN_PRODUCTION'])('%s is accepted', async (status) => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-1', status });
    expect((await submitProductionLog(entry())).outcome).toBe('APPLIED');
  });
});

describe('B114 a discarded row is never applied again', () => {
  it('discard, then retry with a retryable park reason, applies nothing', async () => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-1', status: 'DRAFT' });
    const e = entry();
    await submitProductionLog(e);
    getMisRole.mockResolvedValue('OWNER');
    await discardParkedWrite(e.key, 'entered by mistake');
    const row = fake.state.queued.get(e.key)!;
    expect(row.status).toBe('REJECTED');
    expect(row.resolvedAt).toBeInstanceOf(Date);

    fake.state.orders.set(ORDER, { orderNumber: 'ORD-1', status: 'IN_PRODUCTION' });
    const again = await submitProductionLog(e, { retry: true });
    expect(again.outcome).toBe('REJECTED');
    expect(fake.state.logs).toHaveLength(0);
  });

  it('a duplicate of an APPLIED row still answers APPLIED/DUPLICATE with the original result', async () => {
    const e = entry();
    const first = await submitProductionLog(e);
    expect(first.outcome).toBe('APPLIED');
    const second = await submitProductionLog(e, { retry: true });
    expect(second.outcome).toBe('DUPLICATE');
    expect(second.result?.id).toBe(first.result?.id);
    expect(fake.state.logs).toHaveLength(1);
  });
});

describe('B121 line clearance', () => {
  it('a JOB clearance for another order is not valid even with no booking', async () => {
    fake.state.clearances = [
      { machineId: MACHINE, mode: 'JOB', orderId: OTHER_ORDER, shiftId: null, clearedAt: new Date(Date.now() - 60_000), expiresAt: null },
    ];
    await expect(assertLineCleared(MACHINE, ORDER)).rejects.toMatchObject({ reason: 'EXPIRED' });
    await expect(assertLineCleared(MACHINE, OTHER_ORDER)).resolves.toBeUndefined();
  });

  it('an inactive machine is refused', async () => {
    machineFindUnique.mockResolvedValue({ name: 'Coater 1', isActive: false, deletedAt: null });
    await expect(assertLineCleared(MACHINE, ORDER)).rejects.toThrow(/inactive/);
  });
});

describe('B122 operator, shift and crew', () => {
  it('an inactive operator is refused', async () => {
    employeeFindUnique.mockResolvedValue({ id: EMP, isActive: false, deletedAt: null });
    const out = await submitProductionLog(entry({ employeeId: EMP }), { live: true });
    expect(out.outcome).toBe('REJECTED');
    expect(out.detail).toBe('Operator not found.');
    expect(fake.state.logs).toHaveLength(0);
  });

  it('an operator not on the crew is logged, plus a warning', async () => {
    workerFindFirst.mockResolvedValue(null);
    const out = await submitProductionLog(entry({ employeeId: EMP }));
    expect(out.outcome).toBe('APPLIED');
    expect(out.result?.warnings?.map((w) => w.code)).toContain('NOT_ON_CREW');
    expect(fake.state.logs).toHaveLength(1);
  });

  it('an operator on the crew gives no crew warning', async () => {
    const out = await submitProductionLog(entry({ employeeId: EMP }));
    expect(out.result?.warnings?.map((w) => w.code) ?? []).not.toContain('NOT_ON_CREW');
  });

  it('shiftId is resolved from the log time in the factory timezone (10:00 IST = day shift)', async () => {
    fake.state.shifts = [
      { id: 'day', isActive: true, startTime: '06:00', endTime: '14:00' },
      { id: 'night', isActive: true, startTime: '22:00', endTime: '06:00' },
    ];
    const at = new Date('2026-10-13T04:30:00Z'); // 10:00 IST
    await submitProductionLog(entry({}, { clientRecordedAt: at.toISOString() }));
    expect(fake.state.logs[0].shiftId).toBe('day');
  });
});

describe('B123 booking warning', () => {
  it('a booking for this order gives no warning', async () => {
    allocFindMany.mockResolvedValue([booking(ORDER, 'ORD-1')]);
    expect((await submitProductionLog(entry())).result?.warnings).toBeUndefined();
  });

  it('no booking -> NO_BOOKING, still logged', async () => {
    const out = await submitProductionLog(entry());
    expect(out.outcome).toBe('APPLIED');
    expect(out.result?.warnings?.[0]).toMatchObject({ code: 'NO_BOOKING' });
  });

  it('booked for another order -> OTHER_ORDER naming it', async () => {
    allocFindMany.mockResolvedValue([booking(OTHER_ORDER, 'ORD-12')]);
    const out = await submitProductionLog(entry());
    expect(out.result?.warnings?.[0]).toMatchObject({
      code: 'OTHER_ORDER',
      message: 'Coater 1 is booked for ORD-12, not this order',
    });
  });
});
