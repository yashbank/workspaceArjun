import type { MisLineClearance } from '@/generated/prisma/client';
import type { MisLineClearanceMode } from '@/generated/prisma/enums';
import { minuteOfDay, isMinuteInShiftWindow, resolveShiftAt, shiftDurationMinutes } from '@/lib/mis/shift-window';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { getFactoryTimezone, getLineClearanceRule } from '@/server/mis/business-rules';

/**
 * Thrown by assertLineCleared. Carries the machine and "since when" so the
 * screen can be specific (MIS_UI_SPEC §4.4 rule 2) instead of a bare denial —
 * both branches' messages contain "line clearance" so the FE can offer a
 * "Clear the line" action without re-deriving the reason from a code.
 */
export class LineClearanceBlockedError extends Error {
  constructor(
    public readonly machineId: string,
    public readonly machineName: string,
    public readonly reason: 'NOT_CLEARED' | 'EXPIRED',
    public readonly since?: Date,
  ) {
    super(
      reason === 'EXPIRED'
        ? `${machineName}'s line clearance expired at ${since?.toISOString() ?? 'an earlier time'}.`
        : `${machineName} needs a line clearance before production can be logged.`,
    );
    this.name = 'LineClearanceBlockedError';
  }
}

/** Is `now` still inside the same shift window the clearance was granted in? */
async function isGrantingShiftStillActive(shiftId: string, clearedAt: Date): Promise<boolean> {
  const shift = await db.misShift.findUnique({ where: { id: shiftId } });
  if (!shift) return false;
  const durationMinutes = shiftDurationMinutes(shift);
  const elapsedMinutes = (Date.now() - clearedAt.getTime()) / 60000;
  if (elapsedMinutes >= durationMinutes) return false; // a full cycle has passed - the shift has definitely turned over
  return isMinuteInShiftWindow(minuteOfDay(new Date(), await getFactoryTimezone()), shift);
}

/** The shift whose window contains `at`, or the department default. */
async function resolveShiftIdAt(at: Date): Promise<string | null> {
  const shifts = await db.misShift.findMany({ where: { isActive: true }, orderBy: { startTime: 'asc' } });
  return resolveShiftAt(shifts, at, await getFactoryTimezone())?.id ?? null;
}

/**
 * The machine's order right now, derived from its active allocation — there
 * is no stored "current order" column on MisMachine.
 */
async function currentOrderIdForMachine(machineId: string): Promise<string | null> {
  const now = new Date();
  const allocation = await db.misMachineAllocation.findFirst({
    where: { machineId, startsAt: { lte: now }, endsAt: { gte: now }, releasedAt: null },
    select: { orderId: true },
  });
  return allocation?.orderId ?? null;
}

/**
 * Throws unless `machineId` currently holds a valid clearance. Ungated —
 * called from production.ts after its own production.write check, the same
 * way getRuleValue/getAqlThresholds are used unguarded elsewhere.
 */
export async function assertLineCleared(machineId: string): Promise<void> {
  const machine = await db.misMachine.findUnique({ where: { id: machineId }, select: { name: true } });
  const machineName = machine?.name ?? 'This machine';

  const latest = await db.misLineClearance.findFirst({ where: { machineId }, orderBy: { clearedAt: 'desc' } });
  if (!latest) throw new LineClearanceBlockedError(machineId, machineName, 'NOT_CLEARED');

  const now = new Date();
  if (latest.expiresAt && latest.expiresAt <= now) {
    throw new LineClearanceBlockedError(machineId, machineName, 'EXPIRED', latest.expiresAt);
  }

  if (latest.mode === 'JOB') {
    const currentOrderId = await currentOrderIdForMachine(machineId);
    if (latest.orderId && currentOrderId && currentOrderId !== latest.orderId) {
      throw new LineClearanceBlockedError(machineId, machineName, 'EXPIRED', latest.clearedAt);
    }
  }

  if (latest.mode === 'SHIFT' && latest.shiftId) {
    const stillActive = await isGrantingShiftStillActive(latest.shiftId, latest.clearedAt);
    if (!stillActive) {
      throw new LineClearanceBlockedError(machineId, machineName, 'EXPIRED', latest.clearedAt);
    }
  }
}

/** Non-throwing status, for screens that want a hint or a blocker card without a try/catch. */
export async function getClearanceStatus(
  machineId: string,
): Promise<{ cleared: true } | { cleared: false; reason: 'NOT_CLEARED' | 'EXPIRED'; since?: Date }> {
  try {
    await assertLineCleared(machineId);
    return { cleared: true };
  } catch (err) {
    if (err instanceof LineClearanceBlockedError) {
      return { cleared: false, reason: err.reason, since: err.since };
    }
    throw err;
  }
}

/**
 * Clear a machine's line. SUPERVISOR and above only (clearance.write).
 * Append-only: always a new row, snapshotting the mode/cap business rule (D7)
 * in force right now, so a later rule edit never re-scores a past clearance.
 */
export async function clearLine(input: {
  machineId: string;
  orderId?: string | null;
  notes?: string;
}): Promise<MisLineClearance> {
  const actor = await requirePermission('clearance.write');
  const { mode, maxMinutes } = await getLineClearanceRule();

  const clearedAt = new Date();
  const orderId = input.orderId ?? (await currentOrderIdForMachine(input.machineId));
  const shiftId = await resolveShiftIdAt(clearedAt);

  // For MINUTES mode the cap IS the duration; for JOB/SHIFT it is an optional
  // ceiling on top of the mode's own event-based expiry (D7).
  const validityMinutes = mode === 'MINUTES' ? (maxMinutes ?? 120) : maxMinutes;
  const expiresAt = validityMinutes != null ? new Date(clearedAt.getTime() + validityMinutes * 60000) : null;

  const rec = await db.misLineClearance.create({
    data: {
      machineId: input.machineId,
      clearedById: actor.userId,
      clearedAt,
      mode: mode as MisLineClearanceMode,
      orderId,
      shiftId,
      validityMinutes,
      expiresAt,
      notes: input.notes ?? null,
    },
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'CLEAR_LINE',
    entity: 'MisLineClearance',
    entityId: rec.id,
    after: { machineId: rec.machineId, mode: rec.mode, orderId: rec.orderId, shiftId: rec.shiftId, expiresAt: rec.expiresAt },
  });

  return rec;
}

/** The clearance history for one machine, most recent first — MIS-149. */
export async function listClearanceHistory(machineId: string, take = 10) {
  await requirePermission('clearance.read');
  return db.misLineClearance.findMany({
    where: { machineId },
    include: { order: { select: { orderNumber: true } }, shift: { select: { name: true } } },
    orderBy: { clearedAt: 'desc' },
    take,
  });
}

/**
 * The single most urgent uncleared machine, for the Supervisor home's amber
 * card (R2-Supervisor.png: "{machine} · {order} cannot start"). Only machines
 * with an order actively allocated to them count — an idle machine has
 * nothing waiting on its clearance.
 */
export async function findLineClearanceBlocker(): Promise<{
  machineId: string;
  machineName: string;
  orderId: string;
  orderNumber: string;
} | null> {
  await requirePermission('production.read');
  const now = new Date();
  const activeAllocations = await db.misMachineAllocation.findMany({
    where: { startsAt: { lte: now }, endsAt: { gte: now }, releasedAt: null, orderId: { not: null } },
    include: { machine: { select: { id: true, name: true } }, order: { select: { id: true, orderNumber: true } } },
    orderBy: { startsAt: 'asc' },
  });

  for (const allocation of activeAllocations) {
    if (!allocation.machine || !allocation.order) continue;
    const status = await getClearanceStatus(allocation.machine.id);
    if (!status.cleared) {
      return {
        machineId: allocation.machine.id,
        machineName: allocation.machine.name,
        orderId: allocation.order.id,
        orderNumber: allocation.order.orderNumber,
      };
    }
  }
  return null;
}
