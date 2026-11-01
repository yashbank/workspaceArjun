import { instantAtAxisMinute, shiftDateKeyFor } from '@/lib/mis/crew-hours';
import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey, factoryMinuteOfDay, friendlyWhen } from '@/lib/mis/factory-time';
import { buildMachineTimeline, weekStartKey, type MachineTimeline } from '@/lib/mis/machine-timeline';
import { classifyLogAgainstBookings, worstFlag, type SyncFlag } from '@/lib/mis/machine-sync';
import { isOrderClosed } from '@/lib/mis/order-status';
import { isMinuteInShiftWindow } from '@/lib/mis/shift-window';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { AllocationNotFoundError, flushReleaseAudit, releaseMachineAllocations, type ReleaseAuditEvent } from '@/server/mis/allocation-release';
import { logAuditEvent } from '@/server/mis/audit';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { isActiveStatus } from '@/server/mis/job-phases';
import { getFactoryShiftWindow } from '@/server/mis/shift-view';
import { lockStockKeys } from '@/server/mis/stock-lock';

type BoardSync = { lastLog: { orderNumber: string | null; at: Date } | null; syncFlag: SyncFlag | null };

/**
 * Today's production logs against the bookings, per machine (R3 B99): the last log of the factory
 * day and the worst sync flag. WARN ONLY. This is decoration on the board, so a failure here
 * degrades to "no flag" and is reported to the server log rather than taking the board down.
 *
 * A booking released AFTER a log was written still covers that log (sign-off releases the machine
 * at the end of the job; the log it was running for was legitimate when written).
 */
async function boardSync(machineIds: string[], now: Date): Promise<Map<string, BoardSync>> {
  const out = new Map<string, BoardSync>();
  if (machineIds.length === 0) return out;
  try {
    const tz = await getFactoryTimezone();
    const key = factoryDateKey(now, tz);
    const dayStart = instantAtAxisMinute(key, 0, tz);
    const dayEnd = instantAtAxisMinute(addDaysToDateKey(key, 1), 0, tz);
    const logs = await db.misProductionLog.findMany({
      where: { machineId: { in: machineIds }, loggedAt: { gte: dayStart, lt: dayEnd }, voidedAt: null },
      select: { machineId: true, orderId: true, loggedAt: true, order: { select: { orderNumber: true } } },
      orderBy: { loggedAt: 'asc' },
    });
    if (!logs || logs.length === 0) return out;
    const loggedMachines = [...new Set(logs.map((l) => l.machineId).filter((m): m is string => !!m))];
    const bookings = await db.misMachineAllocation.findMany({
      where: { machineId: { in: loggedMachines }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      select: { machineId: true, orderId: true, startsAt: true, endsAt: true, releasedAt: true },
    });
    for (const machineId of loggedMachines) {
      const mine = logs.filter((l) => l.machineId === machineId);
      const flags = mine.map((l) =>
        classifyLogAgainstBookings(
          { machineId, orderId: l.orderId, at: l.loggedAt },
          (bookings ?? []).map((b) => ({ ...b, releasedAt: b.releasedAt && b.releasedAt > l.loggedAt ? null : b.releasedAt })),
        ),
      );
      const last = mine[mine.length - 1];
      out.set(machineId, { lastLog: { orderNumber: last.order?.orderNumber ?? null, at: last.loggedAt }, syncFlag: worstFlag(flags) });
    }
  } catch (error) {
    console.error('[mis-machine-board] could not compute the log sync flags', error);
    out.clear();
  }
  return out;
}

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
      workerAllocations: { where: { releasedAt: null, deletedAt: null }, select: { employee: { select: { name: true } } } },
    },
  });
  // R2-339: a machine can hold several live bookings at once; keep them all (earliest start first) instead of
  // letting a Map overwrite all but the last one.
  const allocMap = new Map<string, (typeof allocations)[number][]>();
  for (const a of [...allocations].sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime())) {
    allocMap.set(a.machineId, [...(allocMap.get(a.machineId) ?? []), a]);
  }
  const sync = await boardSync(machines.map((m) => m.id), now);
  return machines.map(m => {
    const [alloc, ...others] = allocMap.get(m.id) ?? [];
    const { workerAllocations, ...rest } = (alloc ?? {}) as Partial<(typeof allocations)[number]>;
    return {
      ...m,
      status: (alloc ? 'BUSY' : m.isActive ? 'FREE' : 'OFFLINE') as 'FREE' | 'BUSY' | 'OFFLINE',
      // The names of the open crew ride along so the board can say who a release frees (R3 B101).
      currentAllocation: alloc
        ? { ...(rest as Omit<(typeof allocations)[number], 'workerAllocations'>), crewNames: (workerAllocations ?? []).map((w) => w.employee.name) }
        : null,
      /** R2-339: the other bookings live on this machine right now (concurrent), for the board to list. */
      otherAllocations: others.map((o) => ({ id: o.id, orderNumber: o.order?.orderNumber ?? null, endsAt: o.endsAt, source: o.source })),
      lastLog: sync.get(m.id)?.lastLog ?? null,
      syncFlag: sync.get(m.id)?.syncFlag ?? null,
    };
  });
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
  shift: { id?: string; name: string; dateKey: string; startMinute: number; endMinute: number };
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

  return { shift: { id: shift.id, name: shift.name, dateKey: shift.dateKey, startMinute: shift.startMinute, endMinute: shift.endMinute }, timeline };
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

  // R3 B96: "operators" is who is on it NOW: open rows for the factory's current shift day (and the
  // running shift when one is active), on a booking that has not ended (B86).
  const now = new Date();
  const tz = await getFactoryTimezone();
  const shifts = await db.misShift.findMany({
    where: { isActive: true },
    select: { id: true, startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
  });
  const minute = factoryMinuteOfDay(now, tz);
  const running = (shifts ?? []).find((s) => isMinuteInShiftWindow(minute, s)) ?? null;
  const dayKey = running ? shiftDateKeyFor(running, now, tz) : factoryDateKey(now, tz);

  const rows = await db.misMachineAllocation.findMany({
    where: { orderId, releasedAt: null, jobPhaseId: { not: null } },
    select: {
      jobPhaseId: true,
      startsAt: true,
      endsAt: true,
      machine: { select: { name: true } },
      _count: {
        select: {
          workerAllocations: {
            where: {
              releasedAt: null,
              deletedAt: null,
              allocationDate: dateKeyToDbDate(dayKey),
              ...(running ? { shiftId: running.id } : {}),
              machineAllocation: { releasedAt: null, endsAt: { gte: now } },
            },
          },
        },
      },
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

  // R3 B97: a booking is a real window on a real, running machine for a live order.
  const startMs = data.startsAt.getTime();
  const endMs = data.endsAt.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('The end time must be after the start time.');
  }
  if (endMs - startMs > 7 * 24 * 3600_000) throw new Error('A booking can be at most 7 days long.');

  const machine = await db.misMachine.findFirst({
    where: { id: data.machineId },
    select: { id: true, isActive: true, deletedAt: true },
  });
  if (!machine || machine.deletedAt) throw new Error('That machine no longer exists.');
  if (!machine.isActive) throw new Error('That machine is switched off, so it cannot be booked.');

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

  if (orderId) {
    const order = await db.misOrder.findFirst({ where: { id: orderId }, select: { status: true } });
    if (!order) throw new Error('That order no longer exists.');
    if (order.status === 'DRAFT' || isOrderClosed(order.status)) {
      throw new Error(`That order is ${order.status.toLowerCase().replace('_', ' ')}, so a machine cannot be booked for it.`);
    }
  }

  const tz = await getFactoryTimezone();
  // The overlap check and the create share one transaction and a per-machine lock: two supervisors
  // booking the same machine at once cannot both pass the check.
  const rec = await db.$transaction(async (tx) => {
    await lockStockKeys(tx, [`machine-${data.machineId}`]);
    const overlap = await tx.misMachineAllocation.findFirst({
      where: {
        machineId: data.machineId,
        releasedAt: null,
        startsAt: { lt: data.endsAt },
        endsAt: { gt: data.startsAt },
      },
    });
    if (overlap) {
      throw new Error(`Machine already allocated from ${friendlyWhen(overlap.startsAt, tz)} to ${friendlyWhen(overlap.endsAt, tz)}`);
    }
    return tx.misMachineAllocation.create({
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
  });
  await logAuditEvent({ actorId: actor.userId, action: 'ALLOCATE_MACHINE', entity: 'MisMachineAllocation', entityId: rec.id, after: rec });
  return rec;
}

/**
 * The machine currently allocated to an order (#39/#43), for pre-filling the production forms.
 * Returns the machine only when exactly one is allocated; several (or none) is not a guess we
 * make for the operator. Reads `MisMachineAllocation` the way `currentOrderIdForMachine` does
 * (window spans `at`, not released). `production.read`.
 */
export async function machineForOrder(orderId: string, at: Date = new Date()): Promise<{ id: string; name: string } | null> {
  await requirePermission('production.read');
  const rows = await db.misMachineAllocation.findMany({
    where: { orderId, startsAt: { lte: at }, endsAt: { gte: at }, releasedAt: null },
    select: { machine: { select: { id: true, name: true } } },
  });
  const unique = new Map(rows.map((r) => [r.machine.id, r.machine]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

export async function releaseMachine(allocationId: string) {
  const actor = await requirePermission('production.write');
  let auditEvents: ReleaseAuditEvent[] = [];
  const outcome = await db.$transaction(async (tx) => {
    const rec = await tx.misMachineAllocation.findUnique({ where: { id: allocationId } });
    if (!rec) throw new AllocationNotFoundError();
    // Releasing twice is not an error and must not move the first timestamp (R3 B85).
    if (rec.releasedAt) return { alreadyReleased: true as const, allocation: rec, workers: 0 };

    const at = new Date();
    const res = await releaseMachineAllocations(tx, [allocationId], {
      reason: 'MACHINE_RELEASED',
      actorUserId: actor.userId,
      at,
    });
    auditEvents = res.auditEvents;
    return { alreadyReleased: false as const, allocation: { ...rec, releasedAt: at }, workers: res.workers };
  });
  await flushReleaseAudit(auditEvents);
  return outcome;
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
