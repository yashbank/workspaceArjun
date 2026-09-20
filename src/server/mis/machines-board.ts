import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { isActiveStatus } from '@/server/mis/job-phases';

export async function getMachineBoard() {
  await requirePermission('production.read');
  const machines = await db.misMachine.findMany({
    where: { isActive: true, deletedAt: null },
    include: { department: { select: { name: true } } },
    orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
  });
  const now = new Date();
  const allocations = await db.misMachineAllocation.findMany({
    where: { startsAt: { lte: now }, endsAt: { gte: now }, releasedAt: null },
    include: {
      order: { select: { orderNumber: true } },
      jobPhase: { select: { id: true, process: { select: { name: true } } } },
    },
  });
  const allocMap = new Map<string, (typeof allocations)[number]>(
    allocations.map((a) => [a.machineId, a]),
  );
  return machines.map(m => ({
    ...m,
    status: (allocMap.has(m.id) ? 'BUSY' : m.isActive ? 'FREE' : 'OFFLINE') as
      | 'FREE'
      | 'BUSY'
      | 'OFFLINE',
    currentAllocation: allocMap.get(m.id) ?? null,
  }));
}

export async function getMachineAllocations(machineId: string) {
  await requirePermission('production.read');
  return db.misMachineAllocation.findMany({
    where: { machineId },
    include: {
      order: { select: { orderNumber: true } },
      jobPhase: { select: { id: true, process: { select: { name: true } } } },
    },
    orderBy: { startsAt: 'desc' },
    take: 20,
  });
}

/**
 * `jobPhaseId` is the real link Phase 9 (MIS-261/265) added. `jobRef` stays
 * accepted for now, not because a free-text reference is still wanted, but
 * because `machine-board-screen.tsx` has no order/phase picker yet — that is
 * a scheduling gap this phase found and reported, not a design choice.
 * `orderId` alone (no `jobPhaseId`) is still legitimate: not every allocation
 * is against a planned phase (D10 — an order can have no phase plan at all).
 */
export async function allocateMachine(data: {
  machineId: string;
  orderId?: string;
  jobPhaseId?: string;
  jobRef?: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string;
}) {
  const actor = await requirePermission('production.write');

  let orderId = data.orderId;
  if (data.jobPhaseId) {
    const phase = await db.misJobPhase.findFirst({
      where: { id: data.jobPhaseId, deletedAt: null },
      include: { process: { select: { name: true } } },
    });
    if (!phase) throw new Error('That phase no longer exists.');
    // "A phase from another job card is refused" (MIS-261) — job card = order (D9).
    if (orderId && orderId !== phase.orderId) {
      throw new Error(`${phase.process.name} belongs to a different order than the one selected.`);
    }
    if (!isActiveStatus(phase.status)) {
      throw new Error(
        `${phase.process.name} is not open for allocation (it is ${phase.status.toLowerCase().replace('_', ' ')}).`,
      );
    }
    orderId = orderId ?? phase.orderId;
  }

  // Check for overlap
  const overlap = await db.misMachineAllocation.findFirst({
    where: {
      machineId: data.machineId,
      releasedAt: null,
      startsAt: { lt: data.endsAt },
      endsAt: { gt: data.startsAt },
    },
  });
  if (overlap) throw new Error(`Machine already allocated from ${overlap.startsAt.toISOString()} to ${overlap.endsAt.toISOString()}`);

  const rec = await db.misMachineAllocation.create({
    data: {
      machineId: data.machineId,
      orderId,
      jobPhaseId: data.jobPhaseId ?? null,
      jobRef: data.jobRef,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      notes: data.notes,
      allocatedById: actor.userId,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'ALLOCATE_MACHINE', entity: 'MisMachineAllocation', entityId: rec.id, after: rec });
  return rec;
}

export async function releaseMachine(allocationId: string) {
  const actor = await requirePermission('production.write');
  const rec = await db.misMachineAllocation.update({
    where: { id: allocationId },
    data: { releasedAt: new Date() },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'RELEASE_MACHINE', entity: 'MisMachineAllocation', entityId: rec.id, after: rec });
  return rec;
}

export type MachineStatusCounts = {
  free: number;
  running: number;
  down: number;
  total: number;
  /** Named, because "3 machines down" is not an alert and "Slitter 2" is. */
  downMachines: { id: string; code: string; name: string }[];
};

/**
 * Free / running / down across the whole shop, for the supervisor home 3-up.
 *
 * "Down" is a machine that exists but is switched off (isActive false) — soft
 * deleted machines are gone, not down. No machines at all gives zeros, not a
 * throw: a fresh install has an empty masters table.
 */
export async function getMachineStatusCounts(): Promise<MachineStatusCounts> {
  await requirePermission('production.read');

  const machines = await db.misMachine.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  if (machines.length === 0) {
    return { free: 0, running: 0, down: 0, total: 0, downMachines: [] };
  }

  const now = new Date();
  const allocations = await db.misMachineAllocation.findMany({
    where: { startsAt: { lte: now }, endsAt: { gte: now }, releasedAt: null },
    select: { machineId: true },
  });
  const busy = new Set(allocations.map((a) => a.machineId));

  let free = 0;
  let running = 0;
  const downMachines: { id: string; code: string; name: string }[] = [];
  for (const m of machines) {
    if (!m.isActive) downMachines.push({ id: m.id, code: m.code, name: m.name });
    else if (busy.has(m.id)) running += 1;
    else free += 1;
  }
  return {
    free,
    running,
    down: downMachines.length,
    total: machines.length,
    downMachines: downMachines.slice(0, 5),
  };
}
