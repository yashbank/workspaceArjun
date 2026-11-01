import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey, factoryMinuteOfDay } from '@/lib/mis/factory-time';
import { isUuid, parkable, rejectable, type QueuedWriteEnvelope } from '@/lib/mis/offline/idempotency';
import { instantAtAxisMinute, shiftDateKeyFor, shiftWindowInstants } from '@/lib/mis/crew-hours';
import { correctionVerdict, requireCorrectionReason } from '@/lib/mis/entry-correction';
import { autoBlockWindow, classifyLogAgainstBookings, decideMachineSync, LATE_ENTRY_GRACE_MS, type SyncBooking } from '@/lib/mis/machine-sync';
import { isOrderClosed } from '@/lib/mis/order-status';
import { PRODUCTION_EDIT_WINDOW_MS } from '@/lib/mis/production-form';
import { sumByUnit } from '@/lib/mis/qty-by-unit';
import { isMinuteInShiftWindow } from '@/lib/mis/shift-window';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { runIdempotent, type IdempotentResult, type MisTx, type RunOptions } from '@/server/mis/idempotency';
import { resolveJobPhaseForProduction } from '@/server/mis/job-phases';
import { assertLineCleared } from '@/server/mis/line-clearance';
import { lockStockKeys } from '@/server/mis/stock-lock';
import { findOperatorHoldElsewhere } from '@/server/mis/worker-allocation';

/** A non-blocking note about a log (R3 B122/B123). Never stops the write; replay ignores it. */
export type ProductionWarning = {
  code: 'NOT_ON_CREW' | 'NO_BOOKING' | 'OTHER_ORDER';
  message: string;
};

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
  /** R2-48 — set-up time before the run, whole minutes 0..1440. */
  makereadyMinutes?: number;
};

/** R2-48: makeready is whole minutes, 0 to 24 h (the DB CHECK is the same). */
export const MAKEREADY_MAX_MINUTES = 1440;

function cleanMakeready(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAKEREADY_MAX_MINUTES) {
    throw rejectable('MALFORMED', 'Makeready must be whole minutes between 0 and 1440.');
  }
  return n;
}

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
  // R3 B113 - a DRAFT order has not been confirmed, so it cannot be produced yet. Parkable: the
  // entry replays once someone confirms the order.
  if (order.status === 'DRAFT') {
    throw parkable('ORDER_NOT_STARTED', `Order ${order.orderNumber} is not confirmed yet.`);
  }
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
async function createProductionLog(
  data: LogProductionInput,
  client: MisTx | typeof db,
  opts: {
    /**
     * §B.5.1's audited override: a `clearance.write` holder confirmed this entry against the
     * clearance that was in force at `clientRecordedAt`, not the one in force now — a fresh
     * clearance would certify the machine NOW, which is not the same claim (D7). The inbox
     * (`queue-resolve.ts`) requires `clearance.write` itself before ever setting this.
     */
    skipClearance?: boolean;
  } = {},
) {
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
  if (!opts.skipClearance) await assertLineCleared(data.machineId, data.orderId);
  const jobPhaseId = await resolveJobPhaseForProduction(data.orderId, data.jobPhaseId);

  // #18 — a stage is optional, but a named one must belong to this order's BOM. Checked on the
  // write path so a replayed entry carrying a stale or foreign id is refused, not a raw FK error.
  if (data.bomStageId) {
    const stage = await db.misBomStage.findFirst({
      where: { id: data.bomStageId, bom: { orderId: data.orderId } },
      select: { id: true },
    });
    if (!stage) throw rejectable('MALFORMED', "The process stage chosen is not part of this order's BOM. Pick another stage, or leave it empty.");
  }

  const at = data.loggedAt ?? new Date();

  // R3 B122 - the operator, when named, must be a real, active person.
  if (data.employeeId) {
    const emp = await db.misEmployee.findUnique({
      where: { id: data.employeeId },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (!emp || emp.isActive === false || emp.deletedAt) throw rejectable('MALFORMED', 'Operator not found.');
  }

  const shift = await resolveShift(data.shiftId, at);
  const shiftId = shift?.id ?? null;
  const makereadyMinutes = cleanMakeready(data.makereadyMinutes);

  // R2-47 HARD worker lock: an operator held on another machine this shift is not accepted here.
  // Parked, not rejected: once the holder releases them the same entry goes through.
  if (data.employeeId) {
    const refusal = await operatorLockRefusal(data.employeeId, data.machineId, at, shift);
    if (refusal) throw parkable('WORKER_LOCKED', refusal);
  }

  // R2-40/41/45 — the machine board must agree with what actually ran. Decided inside the write's
  // transaction, before the row exists, so a refused log leaves nothing behind.
  // One board decision per machine at a time: without this, two logs saved together on the same machine both read
  // "nothing covers it" and both create a block (a double booking, or two orders on one machine). Transaction-scoped,
  // so it holds until the queue's transaction commits; a no-op off a transaction.
  if (client !== db) await lockStockKeys(client as MisTx, [`machine-board-${data.machineId}`]);
  const sync = await decideBoardSync(client, data, at);
  if (sync.kind === 'CONFLICT') {
    const who = sync.booking.orderNumber ?? 'another order';
    throw parkable(
      'MACHINE_CONFLICT',
      `This machine is already running ${who} at this time (from another production log). Log this against ${who}, or release that run on the machine board first.`,
    );
  }
  const warnings = await collectWarnings(data, at);

  // Named fields only. Spreading caller input into a create is how a client
  // ends up setting a column it was never meant to reach.
  const rec = await client.misProductionLog.create({
    data: {
      orderId: data.orderId,
      machineId: data.machineId,
      jobPhaseId,
      bomStageId: data.bomStageId,
      employeeId: data.employeeId,
      shiftId,
      qtyProduced: data.qtyProduced,
      qtyWaste: data.qtyWaste ?? 0,
      unit: data.unit ?? 'KG',
      loggedAt: at,
      notes: data.notes,
      ...(makereadyMinutes !== undefined ? { makereadyMinutes } : {}),
      loggedById: actor.userId,
    },
  });

  let autoAllocation: { id: string; startsAt: Date; endsAt: Date } | null = null;
  if (sync.kind === 'EXTEND') {
    // R2-339: the press ran past its booking; stretch that booking to the log instead of opening a duplicate block.
    await client.misMachineAllocation.update({ where: { id: sync.booking.id }, data: { endsAt: at } });
    for (const w of warnings) {
      if (w.code === 'NO_BOOKING') w.message = `${w.message} The earlier booking has been extended to cover it.`;
    }
  }
  if (sync.kind === 'CREATE') {
    const timeZone = await getFactoryTimezone();
    const window = autoBlockWindow(
      at,
      shift?.startTime && shift?.endTime ? shiftWindowInstants(shiftDateKeyFor(shift as ShiftTimesRow, at, timeZone), shift as ShiftTimesRow, timeZone) : null,
    );
    const created = await client.misMachineAllocation.create({
      data: {
        machineId: data.machineId,
        orderId: data.orderId,
        jobPhaseId,
        source: 'PRODUCTION_LOG',
        productionLogId: rec.id,
        allocatedById: actor.userId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        notes: 'Added automatically from a production log',
      },
    });
    autoAllocation = { id: created.id, startsAt: window.startsAt, endsAt: window.endsAt };
    for (const w of warnings) {
      if (w.code === 'NO_BOOKING') w.message = `${w.message} It has been added to the machine board.`;
    }
  }
  return { rec, actorId: actor.userId, warnings, autoAllocation };
}

type ShiftTimesRow = { id: string; startTime: string; endTime: string };

/**
 * R2-47: the refusal text when `employeeId` is held (an open crew row) on a machine other than
 * `machineId` for the log's factory day and shift, else null. The day is the shift's own start date
 * (a night shift after midnight belongs to the day it began), the key the crew board stores.
 */
async function operatorLockRefusal(
  employeeId: string,
  machineId: string,
  at: Date,
  shift: (Partial<ShiftTimesRow> & { id: string }) | null,
): Promise<string | null> {
  const timeZone = await getFactoryTimezone();
  const dateKey =
    shift?.startTime && shift?.endTime ? shiftDateKeyFor(shift as ShiftTimesRow, at, timeZone) : factoryDateKey(at, timeZone);
  const hold = await findOperatorHoldElsewhere({ employeeId, machineId, dateKey, shiftId: shift?.id ?? null, at });
  if (!hold) return null;
  return `This operator is allocated to ${hold.machineName} this shift (held by ${hold.holderName}). Ask ${hold.holderName}, an Admin or the Owner to release them from ${hold.machineName} on the crew board first.`;
}

/** The live bookings covering `at` on this machine, read through the write's own client. */
async function decideBoardSync(client: MisTx | typeof db, data: LogProductionInput, at: Date) {
  const rows = await client.misMachineAllocation.findMany({
    // R2-339: also the booking that ended within the grace window before the log, so a late entry extends it.
    where: { machineId: data.machineId, releasedAt: null, startsAt: { lte: at }, endsAt: { gte: new Date(at.getTime() - LATE_ENTRY_GRACE_MS) } },
    select: { id: true, machineId: true, orderId: true, startsAt: true, endsAt: true, releasedAt: true, source: true, order: { select: { orderNumber: true } } },
  });
  const bookings: SyncBooking[] = (rows ?? []).map((r) => ({
    id: r.id,
    machineId: r.machineId,
    orderId: r.orderId,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    releasedAt: r.releasedAt,
    source: r.source ?? null,
    orderNumber: r.order?.orderNumber ?? null,
  }));
  return decideMachineSync({ machineId: data.machineId, orderId: data.orderId, at }, bookings);
}

/**
 * R2-41: the board block a log created rides in the log's OWN audit row, so one commit writes
 * exactly one audit event (MIS-154) and the allocation is still traceable from the trail.
 */
function withAutoAllocation<T extends object>(after: T, auto: { id: string; startsAt: Date; endsAt: Date } | null) {
  if (!auto) return after;
  return {
    ...after,
    autoAllocation: { id: auto.id, source: 'PRODUCTION_LOG', startsAt: auto.startsAt.toISOString(), endsAt: auto.endsAt.toISOString() },
  };
}

/**
 * R3 B122: the payload's shift when it is active; else the active shift whose window holds
 * `at` on the factory clock; else null. Best effort - a lookup failure must not block a write.
 */
async function resolveShift(requested: string | undefined, at: Date): Promise<Partial<ShiftTimesRow> & { id: string } | null> {
  try {
    if (requested) {
      const named = await db.misShift.findUnique({ where: { id: requested }, select: { id: true, isActive: true, startTime: true, endTime: true } });
      if (named && named.isActive !== false) return named;
    }
    const [shifts, timeZone] = await Promise.all([
      db.misShift.findMany({ where: { isActive: true }, select: { id: true, startTime: true, endTime: true } }),
      getFactoryTimezone(),
    ]);
    const minute = factoryMinuteOfDay(at, timeZone);
    return (shifts ?? []).find((sh) => isMinuteInShiftWindow(minute, sh)) ?? null;
  } catch {
    return null;
  }
}

/** R3 B122 (NOT_ON_CREW) and B123 (NO_BOOKING / OTHER_ORDER). Warn only; swallow lookup failures. */
async function collectWarnings(data: LogProductionInput, at: Date): Promise<ProductionWarning[]> {
  const warnings: ProductionWarning[] = [];
  try {
    const timeZone = await getFactoryTimezone();
    if (data.employeeId) {
      const row = await db.misWorkerAllocation.findFirst({
        where: {
          employeeId: data.employeeId,
          deletedAt: null,
          releasedAt: null,
          allocationDate: dateKeyToDbDate(factoryDateKey(at, timeZone)),
          machineAllocation: { machineId: data.machineId, releasedAt: null },
        },
        select: { id: true },
      });
      if (!row) {
        warnings.push({ code: 'NOT_ON_CREW', message: 'This operator is not on the crew for this machine today.' });
      }
    }

    const bookings = await db.misMachineAllocation.findMany({
      where: { releasedAt: null, OR: [{ orderId: data.orderId }, { machineId: data.machineId }] },
      select: { machineId: true, orderId: true, startsAt: true, endsAt: true, releasedAt: true, order: { select: { orderNumber: true } }, machine: { select: { name: true } } },
    });
    const flag = classifyLogAgainstBookings({ machineId: data.machineId, orderId: data.orderId, at }, bookings);
    if (flag !== 'OK') {
      const machine = await db.misMachine.findUnique({ where: { id: data.machineId }, select: { name: true } });
      const machineName = machine?.name ?? 'This machine';
      if (flag === 'NO_BOOKING') {
        warnings.push({ code: 'NO_BOOKING', message: `${machineName} has no booking at this time.` });
      } else {
        const other = bookings.find(
          (b) => b.machineId === data.machineId && b.orderId !== data.orderId && b.startsAt <= at && at <= b.endsAt,
        );
        warnings.push({
          code: 'OTHER_ORDER',
          message: `${machineName} is booked for ${other?.order?.orderNumber ?? 'another order'}, not this order`,
        });
      }
    }
  } catch {
    // A warning is a courtesy; never fail the write because one could not be computed.
  }
  return warnings;
}

/** The direct, non-queued path. Same gates, same create — one home for the gate list. */
export async function logProduction(data: LogProductionInput) {
  const { rec, actorId, autoAllocation } = await createProductionLog(data, db);
  await logAuditEvent({ actorId, action: 'LOG_PRODUCTION', entity: 'MisProductionLog', entityId: rec.id, after: withAutoAllocation(rec, autoAllocation) });
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
  /** R3 B122 - optional; used when active, else resolved from the log time in the factory timezone. */
  shiftId?: string;
  /** #18 — optional BOM stage ("process") the output belongs to. Validated against the order's BOM on write. */
  bomStageId?: string;
  notes?: string;
  /** R2-48 — makeready (set-up) minutes before the run; optional, whole minutes 0..1440. */
  makereadyMinutes?: number;
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
  /** R3 B122/B123 - non-blocking notes shown on the form; a replay ignores them. */
  warnings?: ProductionWarning[];
};

/**
 * Validate an untrusted payload into a `LogProductionInput`.
 *
 * `jobPhaseId` and `shiftId` are deliberately **not** read from the payload: the
 * phase is re-resolved at replay (Appendix A §A.8, Phase 7's stamp). `bomStageId`
 * IS read (#18, the operator picks the process) but only as a UUID, and
 * `createProductionLog` checks it belongs to this order's BOM. `loggedAt` is the device's
 * `clientRecordedAt` — production entries are a client-recorded kind (D15).
 */
/** R2-329: where a back-dated entry sits on its factory day (12:00). */
const BACKDATE_MINUTE_OF_DAY = 12 * 60;

function toLogInput(payload: unknown, clientRecordedAt: string, timeZone: string): LogProductionInput {
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

  const bomStageId = text(p.bomStageId);
  if (bomStageId && !isUuid(bomStageId)) throw rejectable('MALFORMED', 'This entry names a process stage that is not valid.');

  const shiftId = text(p.shiftId);
  if (shiftId && !isUuid(shiftId)) throw rejectable('MALFORMED', 'This entry names a shift that is not valid.');

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
    // R2-329: a back-date has no real clock time, so it is placed at factory noon of that day (the
    // default working hours), never UTC midnight = 05:30 IST, which no shift covers. A named shift
    // still wins in resolveShift; without one, noon resolves to the day shift.
    loggedAt = instantAtAxisMinute(producedOn, BACKDATE_MINUTE_OF_DAY, timeZone);
  }

  const makereadyMinutes = cleanMakeready(p.makereadyMinutes);

  return { orderId, machineId, qtyProduced, qtyWaste, unit: text(p.unit), employeeId, shiftId, bomStageId, notes: text(p.notes), loggedAt, makereadyMinutes };
}

function summarise(warnings: ProductionWarning[], rec: {
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
    ...(warnings.length > 0 ? { warnings } : {}),
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

  let auto: { id: string; startsAt: Date; endsAt: Date } | null = null;
  const out = await runIdempotent<ProductionLogResult>(
    { ...envelope, kind: 'production.log', actorId },
    async (tx) => {
      // An inbox override is by definition someone other than the original actor — that is
      // the whole reason it exists (a device nobody is holding) — so this identity check is
      // deliberately skipped only when `options.override` is set (§B.10.2 still applies to
      // every live attempt and every plain retry).
      if (!options.override && envelope.queuedBy && envelope.queuedBy !== user.id) {
        throw parkable(
          'FORBIDDEN',
          'This entry was recorded by a different user than the one signed in now, so it will not be sent under their name. Ask them to sign in.',
        );
      }
      const { rec, warnings, autoAllocation } = await createProductionLog(toLogInput(envelope.payload, envelope.clientRecordedAt, await getFactoryTimezone()), tx, {
        skipClearance: options.override?.skipClearance,
      });
      auto = autoAllocation;
      return { entityType: 'MisProductionLog', entityId: rec.id, result: summarise(warnings, rec) };
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
      after: withAutoAllocation(out.result, auto),
    });
  }
  return out;
}

/**
 * What the production forms need once an order is chosen (#18, #39/#43): the stages of that
 * order's BOM and the machine(s) currently allocated to it. Read-only, `production.read`.
 * "Allocated" is the same live test `currentOrderIdForMachine` uses: a window that spans `at`
 * and has not been released.
 */
export async function getProductionFormContext(orderId: string, at: Date = new Date()) {
  await requirePermission('production.read');
  const [stages, allocations] = await Promise.all([
    db.misBomStage.findMany({
      where: { bom: { orderId } },
      select: { id: true, stageName: true, seq: true },
      orderBy: { seq: 'asc' },
    }),
    db.misMachineAllocation.findMany({
      where: { orderId, startsAt: { lte: at }, endsAt: { gte: at }, releasedAt: null },
      select: { machine: { select: { id: true, name: true } } },
    }),
  ]);
  const seen = new Set<string>();
  const machines = allocations
    .map((a) => a.machine)
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  return { stages, machines };
}

export async function getProductionForOrder(orderId: string) {
  await requirePermission('production.read');
  return db.misProductionLog.findMany({
    // R2-17: a voided (deleted) entry is kept for the audit trail but never shown or counted.
    where: { orderId, voidedAt: null },
    include: {
      machine: { select: { name: true } },
      employee: { select: { name: true } },
      shift: { select: { name: true } },
      bomStage: { select: { stageName: true } },
      jobPhase: { select: { status: true } },
    },
    orderBy: { loggedAt: 'desc' },
  });
}

export type ProductionUnitTotal = { unit: string; produced: number; waste: number; wastePercent: number | null };

/** R2-316: when production finished for the CoA — the latest (unvoided) production entry, or null. */
export async function getLastProductionAt(orderId: string): Promise<Date | null> {
  await requirePermission('production.read');
  const last = await db.misProductionLog.findFirst({ where: { orderId, voidedAt: null }, orderBy: { loggedAt: 'desc' }, select: { loggedAt: true } });
  return last?.loggedAt ?? null;
}

export async function getProductionSummary(orderId: string) {
  await requirePermission('production.read');
  const logs = await db.misProductionLog.findMany({ where: { orderId, voidedAt: null } });
  // R3 B124 - never add across units: 500 PIECE and 200 KG are two totals.
  const producedBy = sumByUnit(logs.map((l) => ({ qty: Number(l.qtyProduced), unit: l.unit })));
  const wasteBy = sumByUnit(logs.map((l) => ({ qty: Number(l.qtyWaste ?? 0), unit: l.unit })));
  const byUnit: ProductionUnitTotal[] = producedBy.map((p) => {
    const w = wasteBy.find((x) => x.unit === p.unit)?.qty ?? 0;
    return { unit: p.unit, produced: p.qty, waste: w, wastePercent: p.qty + w > 0 ? (w / (p.qty + w)) * 100 : null };
  });
  // `totalProduced` / `totalWaste` / `unit` are kept for older callers and describe the FIRST unit
  // only (the unit with the alphabetically first name); `byUnit` is the truth.
  const first = byUnit[0];
  return {
    totalProduced: first?.produced ?? 0,
    totalWaste: first?.waste ?? 0,
    unit: first?.unit ?? 'KG',
    byUnit,
    entries: logs.length,
  };
}

export type ProductionDay = { date: Date; produced: number; waste: number };

/**
 * Produced and wasted per day over a window, oldest first — the series behind D1's "Output
 * against plan" chart and the sparklines beside it.
 *
 * One query for the whole window, bucketed here: fourteen days must not be fourteen round
 * trips (S8's rule — "seventy employees is seventy queries if done naively").
 *
 * Days with nothing logged come back as zeroes rather than gaps, so the chart's x-axis is a
 * real calendar and a quiet Sunday is visibly quiet instead of silently missing.
 *
 * Bucketing uses the factory's own day (D22), never the server's.
 */
export async function getProductionSeries(days: number, endingOn: Date = new Date()): Promise<ProductionDay[]> {
  await requirePermission('production.read');

  const span = Math.max(1, Math.min(90, Math.trunc(days)));
  const timeZone = await getFactoryTimezone();
  const lastKey = factoryDateKey(endingOn, timeZone);

  const keys: string[] = [];
  for (let back = span - 1; back >= 0; back -= 1) keys.push(addDaysToDateKey(lastKey, -back));

  const start = dateKeyToDbDate(keys[0]);
  const end = new Date(dateKeyToDbDate(addDaysToDateKey(lastKey, 1)).getTime());

  const logs = await db.misProductionLog.findMany({
    where: { loggedAt: { gte: start, lt: end }, voidedAt: null },
    select: { loggedAt: true, qtyProduced: true, qtyWaste: true },
  });

  const buckets = new Map(keys.map((key) => [key, { produced: 0, waste: 0 }]));
  for (const log of logs) {
    const bucket = buckets.get(factoryDateKey(log.loggedAt, timeZone));
    if (!bucket) continue;
    bucket.produced += Number(log.qtyProduced ?? 0);
    bucket.waste += Number(log.qtyWaste ?? 0);
  }

  return keys.map((key) => ({ date: dateKeyToDbDate(key), ...buckets.get(key)! }));
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

  // R3 B119 - the factory's day, not the server's: fetch a day either side, keep the rows whose
  // factory date key is the asked-for day.
  const timeZone = await getFactoryTimezone();
  const key = factoryDateKey(day, timeZone);
  const candidates = await db.misProductionLog.findMany({
    where: {
      loggedAt: {
        gte: dateKeyToDbDate(addDaysToDateKey(key, -1)),
        lt: dateKeyToDbDate(addDaysToDateKey(key, 2)),
      },
      voidedAt: null,
    },
    select: { qtyProduced: true, qtyWaste: true, machineId: true, loggedAt: true },
  });
  const logs = candidates.filter((l) => factoryDateKey(l.loggedAt, timeZone) === key);

  const produced = logs.reduce((s, l) => s + Number(l.qtyProduced), 0);
  const waste = logs.reduce((s, l) => s + Number(l.qtyWaste ?? 0), 0);
  const machinesRun = new Set(
    logs.map((l) => l.machineId).filter((id): id is string => Boolean(id)),
  ).size;

  return { produced, waste, machinesRun, entries: logs.length };
}

// ---------------------------------------------------------------------------
// R3 B126 / R2-17 - edit or delete (void) an entry
// ---------------------------------------------------------------------------

export { PRODUCTION_EDIT_WINDOW_MS };

export type ProductionLogPatch = {
  qtyProduced?: number;
  qtyWaste?: number;
  wasteReason?: string | null;
  unit?: string;
  machineId?: string;
  employeeId?: string | null;
  bomStageId?: string | null;
  notes?: string | null;
  /** R2-48 — null clears it. */
  makereadyMinutes?: number | null;
  /** R2-17 — why the entry is being corrected; required, 3+ characters, written to the audit row. */
  reason?: string;
};

const EDIT_REFUSAL = 'This entry can no longer be edited (24 h / signed off / order closed).';

/**
 * Who may correct, and until when, is `correctionVerdict` (lib/mis/entry-correction.ts): Admin/Owner
 * within 7 days, a supervisor within 24 h (B126). A signed-off phase or a closed order freezes the
 * entry for everyone, and a voided entry is gone.
 */
export async function editProductionLog(id: string, patch: ProductionLogPatch, now: Date = new Date()) {
  const actor = await requirePermission('production.write');
  const log = await db.misProductionLog.findUnique({
    where: { id },
    include: { jobPhase: { select: { status: true } }, order: { select: { status: true } } },
  });
  if (!log || log.voidedAt) throw new Error('That production entry no longer exists.');
  const verdict = correctionVerdict({
    kind: 'PRODUCTION',
    action: 'EDIT',
    role: actor.role,
    actorId: actor.userId,
    ownerId: log.loggedById,
    at: log.loggedAt,
    now,
    timeZone: await getFactoryTimezone(),
  });
  if (!verdict.allowed || log.jobPhase?.status === 'SIGNED_OFF' || isOrderClosed(log.order.status)) {
    throw new Error(verdict.allowed ? EDIT_REFUSAL : `${EDIT_REFUSAL} ${verdict.reason}`);
  }
  const reason = requireCorrectionReason(patch.reason);

  const qtyProduced = patch.qtyProduced ?? Number(log.qtyProduced);
  const qtyWaste = patch.qtyWaste ?? Number(log.qtyWaste);
  if (!Number.isFinite(qtyProduced) || qtyProduced < 0) throw new Error('The produced quantity is not a valid number.');
  if (!Number.isFinite(qtyWaste) || qtyWaste < 0) throw new Error('The wastage quantity is not a valid number.');
  const makereadyMinutes = patch.makereadyMinutes === null ? null : cleanMakeready(patch.makereadyMinutes);

  const bomStageId = patch.bomStageId === undefined ? log.bomStageId : patch.bomStageId;
  if (patch.bomStageId) {
    const stage = await db.misBomStage.findFirst({
      where: { id: patch.bomStageId, bom: { orderId: log.orderId } },
      select: { id: true },
    });
    if (!stage) throw new Error("The process stage chosen is not part of this order's BOM.");
  }
  if (patch.employeeId) {
    const emp = await db.misEmployee.findUnique({
      where: { id: patch.employeeId },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (!emp || emp.isActive === false || emp.deletedAt) throw new Error('Operator not found.');
  }
  // R2-47: a corrected operator or machine must not put a person held on another machine on this log.
  const nextEmployeeId = patch.employeeId !== undefined ? patch.employeeId : log.employeeId;
  const nextMachineId = patch.machineId || log.machineId;
  if (nextEmployeeId && nextMachineId && (patch.employeeId || patch.machineId) && (nextEmployeeId !== log.employeeId || nextMachineId !== log.machineId)) {
    const refusal = await operatorLockRefusal(nextEmployeeId, nextMachineId, log.loggedAt, await resolveShift(log.shiftId ?? undefined, log.loggedAt));
    if (refusal) throw new Error(refusal);
  }
  if (patch.machineId) {
    const machine = await db.misMachine.findUnique({ where: { id: patch.machineId }, select: { id: true, isActive: true, deletedAt: true } });
    if (!machine || machine.isActive === false || machine.deletedAt) throw new Error('Machine not found.');
    // Same gate as create: a different machine must hold a valid clearance for this order.
    if (patch.machineId !== log.machineId) await assertLineCleared(patch.machineId, log.orderId);
  }

  const rec = await db.misProductionLog.update({
    where: { id },
    data: {
      qtyProduced,
      qtyWaste,
      ...(patch.wasteReason !== undefined ? { wasteReason: patch.wasteReason?.trim() || null } : {}),
      ...(patch.unit ? { unit: patch.unit.trim() || log.unit } : {}),
      ...(patch.machineId ? { machineId: patch.machineId } : {}),
      ...(patch.employeeId !== undefined ? { employeeId: patch.employeeId } : {}),
      bomStageId,
      ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
      ...(patch.makereadyMinutes !== undefined ? { makereadyMinutes } : {}),
    },
  });
  // R2-41: the board block this entry created moves with it to the corrected machine.
  if (patch.machineId && patch.machineId !== log.machineId) {
    await db.misMachineAllocation.updateMany({
      where: { productionLogId: id, source: 'PRODUCTION_LOG', releasedAt: null },
      data: { machineId: patch.machineId },
    });
  }
  await logAuditEvent({
    actorId: actor.userId,
    action: 'PRODUCTION_LOG_EDIT',
    entity: 'MisProductionLog',
    entityId: id,
    before: { qtyProduced: Number(log.qtyProduced), qtyWaste: Number(log.qtyWaste), unit: log.unit },
    after: { qtyProduced, qtyWaste, unit: rec.unit },
    reason,
  });
  return rec;
}

/**
 * R2-17 — delete a production entry: Admin/Owner only, within 7 days, with a reason. It is VOIDED,
 * not erased (voidedAt + voidReason): every total and list skips it, the audit trail keeps it. The
 * machine-board block it auto-created (R2-41) is released with it.
 */
export async function voidProductionLog(id: string, reasonInput: string, now: Date = new Date()) {
  const actor = await requirePermission('production.write');
  const log = await db.misProductionLog.findUnique({
    where: { id },
    include: { jobPhase: { select: { status: true } }, order: { select: { status: true } } },
  });
  if (!log || log.voidedAt) throw new Error('That production entry no longer exists.');
  const verdict = correctionVerdict({
    kind: 'PRODUCTION',
    action: 'DELETE',
    role: actor.role,
    actorId: actor.userId,
    ownerId: log.loggedById,
    at: log.loggedAt,
    now,
    timeZone: await getFactoryTimezone(),
  });
  if (!verdict.allowed) throw new Error(verdict.reason);
  if (log.jobPhase?.status === 'SIGNED_OFF') throw new Error('Reopen the phase to change a signed record.');
  if (isOrderClosed(log.order.status)) throw new Error('The order is closed; its entries can no longer be changed.');
  const reason = requireCorrectionReason(reasonInput);

  const rec = await db.misProductionLog.update({ where: { id }, data: { voidedAt: now, voidReason: reason } });
  const released = await db.misMachineAllocation.updateMany({
    where: { productionLogId: id, source: 'PRODUCTION_LOG', releasedAt: null },
    data: { releasedAt: now },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'PRODUCTION_LOG_VOID',
    entity: 'MisProductionLog',
    entityId: id,
    before: { qtyProduced: Number(log.qtyProduced), qtyWaste: Number(log.qtyWaste), unit: log.unit, loggedAt: log.loggedAt.toISOString() },
    after: { voidedAt: now.toISOString(), autoBlocksReleased: released?.count ?? 0 },
    reason,
  });
  return rec;
}
