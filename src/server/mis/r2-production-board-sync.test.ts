/**
 * R2-40/41/45 — a production log keeps the machine board honest; R2-48 — makeready minutes.
 * Runs the real submit path against the offline fake database (no Postgres).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newIdempotencyKey } from '@/lib/mis/offline/idempotency';

import { createFakeDb } from './offline-fake-db';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const fake = createFakeDb();
const machineFindUnique = vi.fn();
Object.assign(fake.db, { misMachine: { findUnique: (...a: unknown[]) => machineFindUnique(...a) } });
vi.mock('@/server/db', () => ({ db: fake.db }));

const { submitProductionLog } = await import('./production');

const ORDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = '99999999-9999-4999-8999-999999999999';
const MACHINE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
// 10:00 IST on a day shift 06:00-14:00.
const AT = new Date('2026-10-19T04:30:00Z');

function entry(payload: Record<string, unknown> = {}) {
  return {
    key: newIdempotencyKey(),
    kind: 'production.log' as const,
    payload: { orderId: ORDER, machineId: MACHINE, qtyProduced: 10, ...payload },
    clientRecordedAt: AT.toISOString(),
    deviceId: 'tablet-1',
    queuedBy: USER,
  } as Parameters<typeof submitProductionLog>[0];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(AT.getTime() + 60_000));
  audit.mockClear();
  fake.state.queued.clear();
  fake.state.logs = [];
  fake.state.allocations = [];
  fake.state.shifts = [{ id: 'day', isActive: true, startTime: '06:00', endTime: '14:00' }];
  fake.state.orders = new Map([
    [ORDER, { orderNumber: 'ORD-101', status: 'IN_PRODUCTION' }],
    [OTHER, { orderNumber: 'ORD-202', status: 'IN_PRODUCTION' }],
  ]);
  fake.state.clearances = [ORDER, OTHER].map((orderId) => ({
    machineId: MACHINE, mode: 'MINUTES', orderId, shiftId: null, clearedAt: new Date(AT.getTime() - 60_000), expiresAt: new Date(AT.getTime() + 3_600_000),
  }));
  machineFindUnique.mockResolvedValue({ name: 'Die Cutter 01', isActive: true, deletedAt: null });
  getCurrentUser.mockResolvedValue({ id: USER });
  getMisRole.mockResolvedValue('SUPERVISOR');
});

describe('R2-41/45 a log with no booking creates a PRODUCTION_LOG block for its shift', () => {
  it('creates one allocation, linked to the log, spanning the shift, and audits it', async () => {
    const out = await submitProductionLog(entry());
    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.allocations).toHaveLength(1);
    const block = fake.state.allocations[0];
    expect(block).toMatchObject({ machineId: MACHINE, orderId: ORDER, source: 'PRODUCTION_LOG', productionLogId: out.result!.id, allocatedById: USER });
    expect(block.startsAt).toEqual(new Date('2026-10-19T00:30:00Z')); // 06:00 IST
    expect(block.endsAt).toEqual(new Date('2026-10-19T08:30:00Z')); // 14:00 IST
    expect(out.result?.warnings?.[0]).toMatchObject({ code: 'NO_BOOKING', message: expect.stringContaining('added to the machine board') });
    // One audit event per commit (MIS-154): the block rides in the log's own row.
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'LOG_PRODUCTION',
      after: expect.objectContaining({ autoAllocation: expect.objectContaining({ id: block.id, source: 'PRODUCTION_LOG' }) }),
    }));
  });

  it('a second log for the same order in that shift adds nothing (already covered)', async () => {
    await submitProductionLog(entry());
    const second = await submitProductionLog(entry({ qtyProduced: 5 }));
    expect(second.outcome).toBe('APPLIED');
    expect(fake.state.allocations).toHaveLength(1);
  });
});

describe('R2-40 overlapping logs for a different order are refused', () => {
  it('ORD-202 on a machine already running ORD-101 from a log is parked with a clear message; nothing is written', async () => {
    await submitProductionLog(entry());
    const out = await submitProductionLog(entry({ orderId: OTHER }), { live: true });
    expect(out.outcome).toBe('PARKED');
    expect(out.reason).toBe('MACHINE_CONFLICT');
    expect(out.detail).toBe(
      'This machine is already running ORD-101 at this time (from another production log). Log this against ORD-101, or release that run on the machine board first.',
    );
    expect(fake.state.logs).toHaveLength(1);
    expect(fake.state.allocations).toHaveLength(1);
  });

  it('once that run is released, the other order logs and gets its own block', async () => {
    await submitProductionLog(entry());
    fake.state.allocations[0].releasedAt = new Date();
    // The fake does not evaluate where-clauses: drop the released row as the real query would.
    fake.state.allocations = [];
    const out = await submitProductionLog(entry({ orderId: OTHER }));
    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.allocations[0]).toMatchObject({ orderId: OTHER, source: 'PRODUCTION_LOG' });
  });

  it('a SCHEDULED booking for another order stays a warning (R3 B123) and adds no block', async () => {
    fake.state.allocations = [
      { id: 'sched', machineId: MACHINE, orderId: OTHER, source: 'SCHEDULED', startsAt: new Date(AT.getTime() - 3_600_000), endsAt: new Date(AT.getTime() + 3_600_000), releasedAt: null, order: { orderNumber: 'ORD-202' } },
    ];
    const out = await submitProductionLog(entry());
    expect(out.outcome).toBe('APPLIED');
    expect(out.result?.warnings?.map((w) => w.code)).toContain('OTHER_ORDER');
    expect(fake.state.allocations).toHaveLength(1);
  });
});

describe('R2-48 makeready minutes', () => {
  it('is stored when given', async () => {
    await submitProductionLog(entry({ makereadyMinutes: 25 }));
    expect(fake.state.logs[0].makereadyMinutes).toBe(25);
  });
  it('is left out when blank', async () => {
    await submitProductionLog(entry({ makereadyMinutes: '' }));
    expect(fake.state.logs[0]).not.toHaveProperty('makereadyMinutes');
  });
  it.each([-1, 1441, 2.5, 'abc'])('%s is refused as malformed', async (makereadyMinutes) => {
    const out = await submitProductionLog(entry({ makereadyMinutes }), { live: true });
    expect(out.outcome).toBe('REJECTED');
    expect(out.detail).toBe('Makeready must be whole minutes between 0 and 1440.');
    expect(fake.state.logs).toHaveLength(0);
  });
});

describe('permission', () => {
  it.each(['WORKER', 'QC', 'STORE_GUY'])('%s cannot log production (no block is created)', async (role) => {
    getMisRole.mockResolvedValue(role);
    const out = await submitProductionLog(entry(), { live: true });
    expect(out.outcome).not.toBe('APPLIED');
    expect(fake.state.allocations).toHaveLength(0);
  });
});
