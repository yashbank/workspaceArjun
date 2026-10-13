import type { Prisma } from '@/generated/prisma/client';
import { logAuditEvent } from '@/server/mis/audit';

/**
 * The one place a machine booking or a worker row is released (R3 WRK, B85/B87).
 *
 * SHARED CONTRACT, frozen in wave 1: R3-ORD (cancel/close), R3-PRD (phase sign-off) and R3-S2
 * (clock-out) call these inside their own transaction. Do not change a signature.
 *
 * Both helpers only touch rows with `releasedAt IS NULL`, so they are idempotent and never
 * re-stamp a release. They write the audit rows with `logAuditEvent` (which never throws), and
 * they hold no permission gate: the caller gates.
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
): Promise<{ workerAllocationIds: string[] }> {
  const filters: Prisma.MisWorkerAllocationWhereInput = {};
  if (where.ids) filters.id = { in: where.ids };
  if (where.machineAllocationIds) filters.machineAllocationId = { in: where.machineAllocationIds };
  if (where.employeeId) filters.employeeId = where.employeeId;
  if (where.allocationDate) filters.allocationDate = where.allocationDate;
  // No filter at all would release every open row in the factory: refuse by doing nothing.
  if (Object.keys(filters).length === 0) return { workerAllocationIds: [] };
  if ((where.ids && where.ids.length === 0) || (where.machineAllocationIds && where.machineAllocationIds.length === 0)) {
    return { workerAllocationIds: [] };
  }

  const open = await tx.misWorkerAllocation.findMany({
    where: { ...filters, releasedAt: null, deletedAt: null },
    select: { id: true, employeeId: true, machineAllocationId: true },
  });
  if (open.length === 0) return { workerAllocationIds: [] };

  const ids = open.map((r) => r.id);
  await tx.misWorkerAllocation.updateMany({ where: { id: { in: ids }, releasedAt: null }, data: { releasedAt: ctx.at } });
  for (const row of open) {
    await logAuditEvent({
      actorId: ctx.actorUserId,
      action: 'RELEASE_WORKER',
      entity: 'MisWorkerAllocation',
      entityId: row.id,
      before: { releasedAt: null, employeeId: row.employeeId, machineAllocationId: row.machineAllocationId },
      after: { reason: ctx.reason, at: ctx.at.toISOString() },
    });
  }
  return { workerAllocationIds: ids };
}

export async function releaseMachineAllocations(
  tx: Prisma.TransactionClient,
  machineAllocationIds: string[],
  ctx: ReleaseContext,
): Promise<{ machines: number; workers: number; workerAllocationIds: string[] }> {
  if (machineAllocationIds.length === 0) return { machines: 0, workers: 0, workerAllocationIds: [] };

  const open = await tx.misMachineAllocation.findMany({
    where: { id: { in: machineAllocationIds }, releasedAt: null },
    select: { id: true, machineId: true },
  });
  if (open.length === 0) return { machines: 0, workers: 0, workerAllocationIds: [] };

  const openIds = open.map((m) => m.id);
  await tx.misMachineAllocation.updateMany({ where: { id: { in: openIds }, releasedAt: null }, data: { releasedAt: ctx.at } });
  for (const m of open) {
    await logAuditEvent({
      actorId: ctx.actorUserId,
      action: 'RELEASE_MACHINE',
      entity: 'MisMachineAllocation',
      entityId: m.id,
      before: { releasedAt: null, machineId: m.machineId },
      after: { reason: ctx.reason, at: ctx.at.toISOString() },
    });
  }

  const { workerAllocationIds } = await releaseWorkerRows(tx, { machineAllocationIds: openIds }, ctx);
  return { machines: open.length, workers: workerAllocationIds.length, workerAllocationIds };
}
