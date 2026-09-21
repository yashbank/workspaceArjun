import { addDaysToDateKey, dateKeyToDbDate } from '@/lib/mis/factory-time';
import { buildMachineTimeline, weekStartKey, type MachineTimeline } from '@/lib/mis/machine-timeline';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { isActiveStatus } from '@/server/mis/job-phases';
import { getFactoryShiftWindow } from '@/server/mis/shift-view';

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

export type MachineDayTimeline = {
  shift: { name: string; dateKey: string; startMinute: number; endMinute: number };
  timeline: MachineTimeline;
};

/**
 * D5's day timeline: every machine, this shift's bookings, and the week's utilisation.
 *
 * Unlike `getMachineBoard` this INCLUDES machines that are switched off — D5 draws downtime as
 * a hatched bar, and a board that filters `isActive: true` could never show one. Deleted
 * machines are still gone, not down.
 *
 * Two board queries whatever the machine count (S8): one for the machines and one for the week's
 * live bookings — plus the shift lookup (`getFactoryShiftWindow`) and the factory-timezone rule it
 * reads. None of them scales with the number of machines. The window is over-fetched by a day either side and the pure
 * `buildMachineTimeline` does the exact clipping in the factory's zone (D22), so a booking near
 * midnight is never lost to a server-timezone boundary here.
 *
 * Returns null when no shift is configured: the screen shows its empty state rather than
 * inventing nine hours (D5: "one shift definition, read from settings, never hardcoded").
 */
export async function getMachineDayTimeline(now: Date = new Date()): Promise<MachineDayTimeline | null> {
  await requirePermission('production.read');

  const shift = await getFactoryShiftWindow(now);
  if (!shift) return null;

  const weekStart = weekStartKey(shift.dateKey);
  const [machines, allocations] = await Promise.all([
    db.misMachine.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true, machineType: true, isActive: true, department: { select: { name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.misMachineAllocation.findMany({
      where: {
        releasedAt: null,
        endsAt: { gt: dateKeyToDbDate(addDaysToDateKey(weekStart, -1)) },
        startsAt: { lt: dateKeyToDbDate(addDaysToDateKey(shift.dateKey, 3)) },
      },
      select: {
        machineId: true,
        startsAt: true,
        endsAt: true,
        order: { select: { orderNumber: true } },
        jobPhase: { select: { process: { select: { name: true } } } },
      },
      orderBy: { startsAt: 'asc' },
    }),
  ]);

  const timeline = buildMachineTimeline(
    machines.map((m) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      machineType: m.machineType,
      department: m.department?.name ?? null,
      isActive: m.isActive,
    })),
    allocations.map((a) => ({
      machineId: a.machineId,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      orderNumber: a.order?.orderNumber ?? null,
      processName: a.jobPhase?.process.name ?? null,
    })),
    { startMinute: shift.startMinute, endMinute: shift.endMinute, dateKey: shift.dateKey, timeZone: shift.timeZone },
    now,
  );

  return { shift: { name: shift.name, dateKey: shift.dateKey, startMinute: shift.startMinute, endMinute: shift.endMinute }, timeline };
}

/**
 * Where each phase of one order is, or will be, running — machine and time window — for D4's
 * process sequence ("Heidelberg SM 74 · Ramesh Kumar · 4 operators").
 *
 * One query for the whole order, with the operator head-count taken in the same query rather
 * than one count per phase (S8). Released allocations are excluded: a released booking is not a
 * plan any more. When a phase has more than one live allocation the latest-starting one wins,
 * because that is the booking the person will actually be looking for.
 *
 * The operator NAME is not here — D4 shows the phase's in-charge (from `getPhasesForOrder`),
 * which is a different fact from who is on the machine.
 */
export async function getOrderSchedule(orderId: string): Promise<
  Map<string, { machineName: string; startsAt: Date; endsAt: Date; operators: number }>
> {
  await requirePermission('production.read');

  const rows = await db.misMachineAllocation.findMany({
    where: { orderId, releasedAt: null, jobPhaseId: { not: null } },
    select: {
      jobPhaseId: true,
      startsAt: true,
      endsAt: true,
      machine: { select: { name: true } },
      _count: { select: { workerAllocations: { where: { releasedAt: null, deletedAt: null } } } },
    },
    orderBy: { startsAt: 'asc' },
  });

  const byPhase = new Map<string, { machineName: string; startsAt: Date; endsAt: Date; operators: number }>();
  for (const row of rows) {
    if (!row.jobPhaseId) continue;
    // ascending order, so a later row overwrites an earlier one: the latest-starting booking wins.
    byPhase.set(row.jobPhaseId, {
      machineName: row.machine.name,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      operators: row._count.workerAllocations,
    });
  }
  return byPhase;
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
