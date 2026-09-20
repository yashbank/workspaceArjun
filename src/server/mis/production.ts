import { isUuid, parkable, rejectable, type QueuedWriteEnvelope } from '@/lib/mis/offline/idempotency';
import { isOrderClosed } from '@/lib/mis/order-status';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { runIdempotent, type IdempotentResult, type MisTx, type RunOptions } from '@/server/mis/idempotency';
import { resolveJobPhaseForProduction } from '@/server/mis/job-phases';
import { assertLineCleared } from '@/server/mis/line-clearance';

export type LogProductionInput = {
  orderId: string;
  machineId: string;
  jobPhaseId?: string;
  bomStageId?: string;
  employeeId?: string;
  shiftId?: string;
  qtyProduced: number;
  qtyWaste?: number;
  unit?: string;
  loggedAt?: Date;
  notes?: string;
};

/**
 * D14 — a closed order refuses production, online and on replay alike.
 *
 * It throws a *parkable* error rather than a plain one so the offline queue can
 * hold the write for a human instead of guessing: an Admin reopens the order
 * (`reopenOrder`, on the record) and the entry replays (Appendix B §B.5.4). The
 * check lives here, on the write path, not in the queue — otherwise the live
 * and replayed paths would drift into two different rules.
 */
export async function assertOrderOpen(orderId: string): Promise<void> {
  const order = await db.misOrder.findUnique({
    where: { id: orderId },
    select: { orderNumber: true, status: true },
  });
  if (!order) throw rejectable('MALFORMED', 'That order no longer exists.');
  if (isOrderClosed(order.status)) {
    throw parkable(
      'ORDER_CLOSED',
      `${order.orderNumber} is ${order.status.toLowerCase().replace(/_/g, ' ')}, so it no longer accepts production. Ask an admin to reopen the order, then send this again.`,
    );
  }
}

/**
 * Five checks, in this order (DEVELOPMENT_GUIDE.md Appendix A §A.8):
 *
 *   1. `production.write` — may you record production at all;
 *   2. a machine is named (D8) — clearance cannot be checked without one;
 *   3. the order is open (D14);
 *   4. line clearance — is this *machine* fit to run (D7);
 *   5. the phase gate — is this *order's* route at this step.
 *
 * They are deliberately not composed into one super-check. Each answers a
 * different question about a different thing, and folding them together would
 * make any of them impossible to change without disturbing the rest.
 *
 * Everything here is evaluated **now**, at the moment the write lands — for a
 * replayed write that is at replay, not at queue time (Appendix B §B.5). That is
 * why `jobPhaseId` is re-resolved rather than trusted from the payload: the
 * active phase can change while an entry sits in a queue.
 *
 * `wasteReason` is not collected here on purpose — the entry screen stays two
 * taps, and the reason is required at sign-off instead (D11).
 *
 * Takes the client explicitly so the queue's transaction can own the write
 * (§B.7). The audit event is *not* written here: it is written after commit, by
 * the caller, because an audit row for a write that then rolled back is a lie.
 */
async function createProductionLog(data: LogProductionInput, client: MisTx | typeof db) {
  const actor = await requirePermission('production.write');

  // D8 defence in depth. The types already say machineId is required, but this
  // is a server function reached by untrusted input, and a queued entry from an
  // older build can arrive without one. Never inferred from the order, the last
  // allocation or the operator's usual press — a guess attaches output to the
  // wrong machine, undetectably (Appendix B §B.5.5).
  if (!data.machineId) {
    throw rejectable('MACHINE_MISSING', 'This entry has no machine, so its line clearance cannot be checked. Name the machine and record it again.');
  }

  await assertOrderOpen(data.orderId);
  await assertLineCleared(data.machineId);
  const jobPhaseId = await resolveJobPhaseForProduction(data.orderId, data.jobPhaseId);

  // Named fields only. Spreading caller input into a create is how a client
  // ends up setting a column it was never meant to reach.
  const rec = await client.misProductionLog.create({
    data: {
      orderId: data.orderId,
      machineId: data.machineId,
      jobPhaseId,
      bomStageId: data.bomStageId,
      employeeId: data.employeeId,
      shiftId: data.shiftId,
      qtyProduced: data.qtyProduced,
      qtyWaste: data.qtyWaste ?? 0,
      unit: data.unit ?? 'KG',
      loggedAt: data.loggedAt ?? new Date(),
      notes: data.notes,
      loggedById: actor.userId,
    },
  });
  return { rec, actorId: actor.userId };
}

/** The direct, non-queued path. Same gates, same create — one home for the gate list. */
export async function logProduction(data: LogProductionInput) {
  const { rec, actorId } = await createProductionLog(data, db);
  await logAuditEvent({ actorId, action: 'LOG_PRODUCTION', entity: 'MisProductionLog', entityId: rec.id, after: rec });
  return rec;
}

/** What a queued or live production entry carries. Only these fields cross the boundary. */
export type ProductionLogPayload = {
  orderId: string;
  machineId: string;
  qtyProduced: number;
  qtyWaste?: number;
  unit?: string;
  employeeId?: string;
  notes?: string;
  /**
   * `YYYY-MM-DD`, only when the person deliberately back-dates an entry — the
   * detail screen's Date field. This is the *business* date they chose, and it is
   * distinct from `clientRecordedAt`, which is when they tapped. Absent means
   * "now", which is the tap time (D15).
   */
  producedOn?: string;
};

/**
 * The JSON-safe answer stored against the key and replayed to every duplicate
 * (§B.3). No Decimal, no Date — neither survives the round trip.
 */
export type ProductionLogResult = {
  id: string;
  orderId: string;
  machineId: string;
  jobPhaseId: string | null;
  qtyProduced: number;
  qtyWaste: number;
  unit: string;
  loggedAt: string;
};

/**
 * Validate an untrusted payload into a `LogProductionInput`.
 *
 * `jobPhaseId`, `bomStageId` and `shiftId` are deliberately **not** read from the
 * payload: the phase is re-resolved at replay (Appendix A §A.8, Phase 7's stamp),
 * and nothing else here is the client's to choose. `loggedAt` is the device's
 * `clientRecordedAt` — production entries are a client-recorded kind (D15).
 */
function toLogInput(payload: unknown, clientRecordedAt: string): LogProductionInput {
  const p = (payload ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  const orderId = text(p.orderId);
  if (!orderId || !isUuid(orderId)) throw rejectable('MALFORMED', 'This entry has no valid order.');

  const machineId = text(p.machineId);
  if (!machineId) throw rejectable('MACHINE_MISSING', 'This entry has no machine, so its line clearance cannot be checked. Name the machine and record it again.');
  if (!isUuid(machineId)) throw rejectable('MALFORMED', 'This entry names a machine that is not valid.');

  const qtyProduced = Number(p.qtyProduced);
  if (!Number.isFinite(qtyProduced) || qtyProduced < 0) throw rejectable('MALFORMED', 'The produced quantity is not a valid number.');

  const qtyWaste = p.qtyWaste === undefined || p.qtyWaste === null || p.qtyWaste === '' ? 0 : Number(p.qtyWaste);
  if (!Number.isFinite(qtyWaste) || qtyWaste < 0) throw rejectable('MALFORMED', 'The wastage quantity is not a valid number.');

  const employeeId = text(p.employeeId);
  if (employeeId && !isUuid(employeeId)) throw rejectable('MALFORMED', 'This entry names an operator that is not valid.');

  const recordedAt = new Date(clientRecordedAt);
  if (Number.isNaN(recordedAt.getTime())) throw rejectable('MALFORMED', 'The recorded time is not a valid date.');

  // An explicit back-date wins; otherwise the moment of the tap is the time (D15).
  let loggedAt = recordedAt;
  const producedOn = text(p.producedOn);
  if (producedOn) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(producedOn) ? new Date(producedOn) : null;
    if (!day || Number.isNaN(day.getTime())) throw rejectable('MALFORMED', 'The production date is not a valid date.');
    // Not the future: a back-date is for something that already happened.
    if (day.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw rejectable('MALFORMED', 'The production date is in the future.');
    loggedAt = day;
  }

  return { orderId, machineId, qtyProduced, qtyWaste, unit: text(p.unit), employeeId, notes: text(p.notes), loggedAt };
}

function summarise(rec: {
  id: string;
  orderId: string;
  machineId: string | null;
  jobPhaseId: string | null;
  qtyProduced: unknown;
  qtyWaste: unknown;
  unit: string;
  loggedAt: Date;
}): ProductionLogResult {
  return {
    id: rec.id,
    orderId: rec.orderId,
    machineId: rec.machineId ?? '',
    jobPhaseId: rec.jobPhaseId,
    qtyProduced: Number(rec.qtyProduced),
    qtyWaste: Number(rec.qtyWaste),
    unit: rec.unit,
    loggedAt: rec.loggedAt.toISOString(),
  };
}

/**
 * The one entry point for recording production from a screen — live or replayed.
 *
 * Idempotent (MIS-154): the key generated at the tap makes a retry, a
 * double-tap and a replay after a lost response all land exactly once, and the
 * key row and the production row commit in **one transaction** (Appendix B
 * §B.7). The gates are the same ones `logProduction` runs; this only wraps them.
 *
 * Returns an outcome, it does not throw one. In a production build React
 * replaces any error a server action throws with a generic message, so a screen
 * reading `error.message` would work in development and break in production
 * (§B.10.3).
 *
 * The actor is the *signed-in* user, and it must be the person who made the
 * entry (`queuedBy`), or the write parks: it is never re-attributed to whoever
 * happens to be signed in when a tablet syncs (§B.10.2). A signed-out device is
 * not a withdrawn permission, so it returns RETRY and waits for a sign-in.
 */
export async function submitProductionLog(
  envelope: QueuedWriteEnvelope<ProductionLogPayload>,
  options: RunOptions = {},
): Promise<IdempotentResult<ProductionLogResult>> {
  const user = await getCurrentUser();
  if (!user) return { outcome: 'RETRY', detail: 'You are signed out. Sign in and this will send.' };

  // Attribute the write to whoever made it, so a held entry shows the right name.
  const actorId = envelope.queuedBy ?? user.id;

  const out = await runIdempotent<ProductionLogResult>(
    { ...envelope, kind: 'production.log', actorId },
    async (tx) => {
      if (envelope.queuedBy && envelope.queuedBy !== user.id) {
        throw parkable(
          'FORBIDDEN',
          'This entry was recorded by a different user than the one signed in now, so it will not be sent under their name. Ask them to sign in.',
        );
      }
      const { rec } = await createProductionLog(toLogInput(envelope.payload, envelope.clientRecordedAt), tx);
      return { entityType: 'MisProductionLog', entityId: rec.id, result: summarise(rec) };
    },
    options,
  );

  // After commit, never inside the transaction: an audit row for a write that
  // then rolled back would be a record of something that did not happen.
  if (out.outcome === 'APPLIED' && out.result) {
    await logAuditEvent({
      actorId: user.id,
      action: 'LOG_PRODUCTION',
      entity: 'MisProductionLog',
      entityId: out.result.id,
      after: out.result,
    });
  }
  return out;
}

export async function getProductionForOrder(orderId: string) {
  await requirePermission('production.read');
  return db.misProductionLog.findMany({
    where: { orderId },
    include: {
      machine: { select: { name: true } },
      employee: { select: { name: true } },
      shift: { select: { name: true } },
    },
    orderBy: { loggedAt: 'desc' },
  });
}

export async function getProductionSummary(orderId: string) {
  await requirePermission('production.read');
  const logs = await db.misProductionLog.findMany({ where: { orderId } });
  const totalProduced = logs.reduce((s, l) => s + Number(l.qtyProduced), 0);
  const totalWaste = logs.reduce((s, l) => s + Number(l.qtyWaste), 0);
  return { totalProduced, totalWaste, entries: logs.length };
}

export type DayProductionSummary = {
  produced: number;
  waste: number;
  machinesRun: number;
  entries: number;
};

/**
 * Produced / wasted / machines run for one calendar day.
 *
 * The home screen shows the *closed* day, not the current one: at 7am a "today"
 * figure reads as an idle factory. Returns zeros when nothing was logged rather
 * than throwing, so an empty table still renders an honest card.
 */
export async function getDayProductionSummary(day: Date): Promise<DayProductionSummary> {
  await requirePermission('production.read');

  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const logs = await db.misProductionLog.findMany({
    where: { loggedAt: { gte: start, lt: end } },
    select: { qtyProduced: true, qtyWaste: true, machineId: true },
  });

  const produced = logs.reduce((s, l) => s + Number(l.qtyProduced), 0);
  const waste = logs.reduce((s, l) => s + Number(l.qtyWaste ?? 0), 0);
  const machinesRun = new Set(
    logs.map((l) => l.machineId).filter((id): id is string => Boolean(id)),
  ).size;

  return { produced, waste, machinesRun, entries: logs.length };
}
