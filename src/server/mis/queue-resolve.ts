import {
  isRetryablePark,
  type ParkReason,
  type QueuedWriteEnvelope,
  type QueuedWriteKind,
} from '@/lib/mis/offline/idempotency';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { MisForbiddenError, requirePermission } from '@/server/mis/auth';
import { submitPunch } from '@/server/mis/attendance-punch';
import { KIND_READ_PERMISSION, type IdempotentResult } from '@/server/mis/idempotency';
import { submitProductionLog, type ProductionLogPayload } from '@/server/mis/production';

/**
 * Phase 23's "apply past a park" — the inbox's one resolve action (Appendix B §B.7,
 * §B.10.4). `discardParkedWrite` (idempotency.ts) is the other half: `queue.review`
 * alone may see and discard, never apply something it could not have applied itself.
 *
 * Both call the SAME server function the live/device path calls (`submitProductionLog`,
 * `submitPunch`) — there is no second write path to drift out of step with the first
 * (B.9). What differs is the `override` this file passes: it carries WHO is resolving
 * and WHY, and the specific check to skip for this park reason, decided from a fixed
 * table below, never guessed per call site.
 */
export async function resolveParkedWrite(key: string, note: string): Promise<IdempotentResult<unknown>> {
  const actor = await requirePermission('queue.review');
  const trimmed = note.trim();
  if (trimmed.length < 3) {
    throw new Error('A reason of at least three characters is required to resolve a parked write.');
  }

  const row = await db.misQueuedWrite.findUnique({ where: { key } });
  if (!row) throw new Error(`No parked write found for key ${key}.`);

  const kind = row.kind as QueuedWriteKind;
  const kindPermission = KIND_READ_PERMISSION[kind];
  if (!can(actor.role, kindPermission)) throw new MisForbiddenError(kindPermission, key);

  if (row.status !== 'PARKED') {
    throw new Error(`This write is ${row.status.toLowerCase()}; only a PARKED write can be resolved (discard a REJECTED one instead).`);
  }
  const reason = row.parkReason as ParkReason | null;
  if (!reason) throw new Error('This write has no park reason recorded.');

  type Override = { by: string; note: string; skipTiming?: boolean; skipClearance?: boolean; skipEmployeeChecks?: boolean };
  let override: Override;

  if (isRetryablePark(reason)) {
    // ORDER_CLOSED / PHASE_SIGNED_OFF / PHASE_NOT_ACTIVE / PHASE_AMBIGUOUS / FORBIDDEN / UNKNOWN
    // — the world must already have changed on the record (an Owner's `reopenPhase`, an
    // `orders.write` holder's `reopenOrder`, or the actor's own right restored). This only
    // lets the write land past `queuedBy`'s identity check, which a resolver from the office
    // is never the original holder of (§B.5.2, §B.5.4, §B.10.4).
    override = { by: actor.userId, note: trimmed };
  } else if (reason === 'CLEARANCE_EXPIRED' || reason === 'CLEARANCE_MISSING') {
    // §B.5.1: a human decides, on the record, that the 14:05 setup really was cleared —
    // never a fresh clearance laundered into covering it.
    await requirePermission('clearance.write');
    override = { by: actor.userId, note: trimmed, skipClearance: true };
  } else if (
    reason === 'CLOCK_SKEW' ||
    reason === 'TOO_OLD' ||
    reason === 'EMPLOYEE_INACTIVE' ||
    reason === 'CORRECTION_WINDOW_CLOSED'
  ) {
    // D15 / D21: only a person may vouch for a time the device got wrong, or decide a punch
    // for someone off the active roll or past the correction window. Never `BADGE_UNKNOWN` —
    // that has its own resolution below.
    await requirePermission('attendance.write');
    override = {
      by: actor.userId,
      note: trimmed,
      skipTiming: reason === 'CLOCK_SKEW' || reason === 'TOO_OLD',
      skipEmployeeChecks: reason === 'EMPLOYEE_INACTIVE' || reason === 'CORRECTION_WINDOW_CLOSED',
    };
  } else {
    // BADGE_UNKNOWN resolves only via the tablet's own Fix (K2, `correctsKey`) — never this
    // inbox. Every other reason here (MACHINE_MISSING, MALFORMED, BAD_KEY) is REJECTED-only
    // and already excluded by the PARKED check above.
    throw new Error(`${reason} cannot be resolved from the inbox. Discard it, or resolve it from the device that made it.`);
  }

  const envelope = {
    key: row.key,
    kind,
    payload: row.payload,
    clientRecordedAt: (row.clientRecordedAt ?? new Date()).toISOString(),
    deviceId: row.deviceId ?? undefined,
    queuedBy: row.actorId ?? undefined,
  };

  if (kind === 'production.log') {
    return submitProductionLog(envelope as QueuedWriteEnvelope<ProductionLogPayload>, { override });
  }
  if (kind === 'attendance.punch_in' || kind === 'attendance.punch_out') {
    return submitPunch(envelope as QueuedWriteEnvelope, { override });
  }
  // 'production.waste_reason' is a declared QUEUEABLE_KINDS member with no idempotent write
  // function behind it yet — a pre-existing gap (nothing today ever parks one). Named here
  // rather than silently mishandled if that ever changes.
  throw new Error(`${kind} has no resolve path yet — it is not wired to any idempotent write function.`);
}
