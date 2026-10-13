/** R3-ORD: the release helpers never touch the global audit writer; they return events for flushReleaseAudit. */
import { describe, expect, it, vi } from 'vitest';

const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (e: unknown) => audit(e) }));

const { releaseMachineAllocations, releaseWorkerRows, flushReleaseAudit } = await import('./allocation-release');

const tx = {
  misMachineAllocation: {
    findMany: async () => [{ id: 'm1', machineId: 'mc1' }],
    updateMany: async () => ({ count: 1 }),
  },
  misWorkerAllocation: {
    findMany: async () => [{ id: 'w1', employeeId: 'e1', machineAllocationId: 'm1' }],
    updateMany: async () => ({ count: 1 }),
  },
} as never;
const ctx = { reason: 'ORDER_CLOSED' as const, actorUserId: 'u1', at: new Date('2026-10-13T00:00:00Z') };

describe('release helpers', () => {
  it('log nothing themselves and return the exact events', async () => {
    const res = await releaseMachineAllocations(tx, ['m1'], ctx);
    expect(audit).not.toHaveBeenCalled();
    expect(res.auditEvents.map((e) => e.action)).toEqual(['RELEASE_MACHINE', 'RELEASE_WORKER']);
    expect(res.auditEvents[1].after).toMatchObject({ reason: 'ORDER_CLOSED' });
    const workers = await releaseWorkerRows(tx, { ids: ['w1'] }, ctx);
    expect(workers.auditEvents).toHaveLength(1);
    expect(audit).not.toHaveBeenCalled();
  });

  it('flushReleaseAudit logs them in order', async () => {
    const res = await releaseMachineAllocations(tx, ['m1'], ctx);
    await flushReleaseAudit(res.auditEvents);
    expect(audit.mock.calls.map(([e]) => (e as { action: string }).action)).toEqual(['RELEASE_MACHINE', 'RELEASE_WORKER']);
  });
});
