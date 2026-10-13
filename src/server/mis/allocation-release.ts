import type { Prisma } from '@/generated/prisma/client';
import { logAuditEvent, type AuditEntry } from '@/server/mis/audit';

/**
 * The one place a machine booking or a worker row is released (R3 WRK, B85/B87).
 *
 * SHARED CONTRACT, frozen in wave 1: R3-ORD (cancel/close), R3-PRD (phase sign-off) and R3-S2
 * (clock-out) call these inside their own transaction. Do not change a signature.
 *
 * Both helpers only touch rows with `releasedAt IS NULL`, so they are idempotent and never
 * re-stamp a release. They hold no permission gate: the caller gates.
 *
 * AUDIT: `logAuditEvent` uses the global client, so calling it inside the caller's interactive
 * transaction starves a connection_limit=1 pool. These helpers therefore do NOT log; they return
 * `auditEvents` (the exact entries they would have logged) and the caller passes them to
 * `flushReleaseAudit` AFTER the transaction commits.
 *
 * The reason lives in the audit row only until R3-S2 adds the `releaseReason` column.
 */
export type ReleaseReason =
  | 'MANUAL'
  | 'MOVED'
  | 'PHASE_SIGNED_OFF'
  | 'MACHINE_RELEASED'
  | 'ORDER_CLOSED'
  | 'CLOCKED_OUT';

/** The audit entries a release produced, to be logged after commit with `flushReleaseAudit`. */
export type ReleaseAuditEvent = AuditEntry;

/** Log the entries returned by a release helper. Call AFTER the transaction has committed. */
export async function flushReleaseAudit(events: ReleaseAuditEvent[]): Promise<void> {
  for (const event of events) await logAuditEvent(event);
}

export type ReleaseContext = { reason: ReleaseReason; actorUserId: string | null; at: Date };

/** A typed "no such booking", so a caller can tell it from a failure. */
export class AllocationNotFoundError extends Error {
  constructor(message = 'That machine allocation no longer exists.') {
    super(message);
    this.name = 'AllocationNotFoundError';
  }
}

export async function releaseWorkerRows(
  tx: Prisma.TransactionClient,
  where: { ids?: string[]; machineAllocationIds?: string[]; employeeId?: string; allocationDate?: Date },
  ctx: ReleaseContext,
): Promise<{ workerAllocationIds: string[]; auditEvents: ReleaseAuditEvent[] }> {
  const filters: Prisma.MisWorkerAllocationWhereInput = {};
  if (where.ids) filters.id = { in: where.ids };
  if (where.machineAllocationIds) filters.machineAllocationId = { in: where.machineAllocationIds };
  if (where.employeeId) filters.employeeId = where.employeeId;
  if (where.allocationDate) filters.allocationDate = where.allocationDate;
  // No filter at all would release every open row in the factory: refuse by doing nothing.
  if (Object.keys(filters).length === 0) return { workerAllocationIds: [], auditEvents: [] };
  if ((where.ids && where.ids.length === 0) || (where.machineAllocationIds && where.machineAllocationIds.length === 0)) {
    return { workerAllocationIds: [], auditEvents: [] };
  }

  const open = await tx.misWorkerAllocation.findMany({
    where: { ...filters, releasedAt: null, deletedAt: null },
    select: { id: true, employeeId: true, machineAllocationId: true },
  });
  if (open.length === 0) return { workerAllocationIds: [], auditEvents: [] };

  const ids = open.map((r) => r.id);
  await tx.misWorkerAllocation.updateMany({ where: { id: { in: ids }, releasedAt: null }, data: { releasedAt: ctx.at } });
  const auditEvents: ReleaseAuditEvent[] = [];
  for (const row of open) {
    auditEvents.push({
      actorId: ctx.actorUserId,
      action: 'RELEASE_WORKER',
      entity: 'MisWorkerAllocation',
      entityId: row.id,
      before: { releasedAt: null, employeeId: row.employeeId, machineAllocationId: row.machineAllocationId },
      after: { reason: ctx.reason, at: ctx.at.toISOString() },
    });
  }
  return { workerAllocationIds: ids, auditEvents };
}

export async function releaseMachineAllocations(
  tx: Prisma.TransactionClient,
  machineAllocationIds: string[],
  ctx: ReleaseContext,
): Promise<{ machines: number; workers: number; workerAllocationIds: string[]; auditEvents: ReleaseAuditEvent[] }> {
  if (machineAllocationIds.length === 0) return { machines: 0, workers: 0, workerAllocationIds: [], auditEvents: [] };

  const open = await tx.misMachineAllocation.findMany({
    where: { id: { in: machineAllocationIds }, releasedAt: null },
    select: { id: true, machineId: true },
  });
  if (open.length === 0) return { machines: 0, workers: 0, workerAllocationIds: [], auditEvents: [] };

  const openIds = open.map((m) => m.id);
  await tx.misMachineAllocation.updateMany({ where: { id: { in: openIds }, releasedAt: null }, data: { releasedAt: ctx.at } });
  const auditEvents: ReleaseAuditEvent[] = [];
  for (const m of open) {
    auditEvents.push({
      actorId: ctx.actorUserId,
      action: 'RELEASE_MACHINE',
      entity: 'MisMachineAllocation',
      entityId: m.id,
      before: { releasedAt: null, machineId: m.machineId },
      after: { reason: ctx.reason, at: ctx.at.toISOString() },
    });
  }

  const released = await releaseWorkerRows(tx, { machineAllocationIds: openIds }, ctx);
  return {
    machines: open.length,
    workers: released.workerAllocationIds.length,
    workerAllocationIds: released.workerAllocationIds,
    auditEvents: [...auditEvents, ...released.auditEvents],
  };
}
