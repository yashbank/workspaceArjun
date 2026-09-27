import type { Prisma } from '@/generated/prisma/client';
import {
  isIdempotencyKey,
  isRetryablePark,
  QUEUEABLE_KINDS,
  TIME_SOURCE,
  type ParkReason,
  type QueuedWriteEnvelope,
  type QueuedWriteKind,
  type ReplayOutcome,
} from '@/lib/mis/offline/idempotency';
import { can, type MisAction } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { isMisForbiddenError, MisForbiddenError, requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { getOfflineRules } from '@/server/mis/business-rules';
import { isJobPhaseError } from '@/server/mis/job-phases';
import { LineClearanceBlockedError } from '@/server/mis/line-clearance';

/**
 * The server half of the offline write contract —
 * `docs/DEVELOPMENT_GUIDE.md` **Appendix B**.
 *
 * Two jobs, and only two:
 *
 *  1. **Dedupe**, transactionally (§B.2, §B.7, §B.10.5). The idempotency row and
 *     the business row go in together or neither goes in at all.
 *  2. **Classify** a failure into one of the five outcomes (§B.3), so a write
 *     that was legal when queued and is illegal now is parked in front of a
 *     human instead of dropped or forced.
 *
 * It deliberately does NOT re-implement any gate. A replay calls the same
 * server function the online path calls; the gates throw exactly as they
 * always do, and this module only reads what they threw. There is no second
 * write path here to drift out of step with the first.
 *
 * Phase 23 adds the inbox's own doors at the bottom of this file: list, detail,
 * discard and the audited overrides. The screen lives elsewhere; this is all of it.
 */

/** The transaction handle a business write must use so §B.7's rule holds. */
export type MisTx = Prisma.TransactionClient;

export type IdempotentResult<T> = {
  outcome: ReplayOutcome;
  /** Present for APPLIED and DUPLICATE. A duplicate returns the ORIGINAL result, not an error. */
  result?: T;
  reason?: ParkReason;
  detail?: string;
};

export type RunOptions = {
  /**
   * A live attempt — the person is at the screen with signal (§B.10.1).
   *
   * A gate that refuses a live attempt returns the refusal to the caller and
   * records **nothing**. A parked key is final, so parking the first live
   * refusal would make "you forgot to clear the line → clear it → tap Log
   * again" return the old park for ever.
   */
  live?: boolean;
  /**
   * A human asked for a held write to be replayed (§B.10.4). Honoured only for
   * reasons in `RETRYABLE_PARK_REASONS` (D17). Re-runs *every* gate; forces
   * nothing.
   */
  retry?: boolean;
  /**
   * Phase 23's inbox: an audited override or office-resolve, by someone other
   * than the original actor (`queuedBy`) — the whole reason the inbox exists is
   * a device nobody is holding. `by`/`note` become `resolvedById`/`resolutionNote`
   * in place of the plain-retry default, so the audit trail names who took
   * responsibility and why (§B.5.1, §B.5.2, §B.10.4).
   *
   * Presence of `override` also lets a PARKED row past the `isRetryablePark`
   * gate below — the caller (`queue-resolve.ts`) has already separately
   * required the specific right this reason needs (`clearance.write`,
   * `attendance.write`) before calling in, on top of `queue.review`.
   *
   * `skipTiming` re-runs everything BUT `checkTiming` — the only way past
   * `CLOCK_SKEW`/`TOO_OLD`, which a plain retry can never clear (D15: only a
   * person may vouch for a time the device got wrong). Domain-specific flags
   * (`skipClearance` for production, `skipEmployeeChecks` for punches) are read
   * by the apply callback itself; unused ones are simply ignored.
   */
  override?: {
    by: string;
    note: string;
    skipTiming?: boolean;
    skipClearance?: boolean;
    skipEmployeeChecks?: boolean;
  };
};

/**
 * An unknown failure is retried a few times before it parks.
 *
 * Parking immediately would turn a network blip into manual work; retrying
 * forever would hide a real bug in a hot loop. Neither silently drops
 * anything, which is the rule that actually matters (§B.3).
 */
const MAX_UNKNOWN_ATTEMPTS = 5;

/** Prisma codes that mean "try again", not "this is wrong". */
const TRANSIENT_PRISMA_CODES = new Set([
  'P1001', // can't reach the database
  'P1002', // database timed out
  'P1008', // operation timed out
  'P1017', // server closed the connection
  'P2024', // connection pool timeout
  'P2034', // write conflict / deadlock, retry the transaction
]);

type Classification = { outcome: ReplayOutcome; reason?: ParkReason; detail?: string };

/**
 * Thrown inside the transaction when another attempt claimed the key first.
 * Rolling back is the point: the loser's business write must not survive it.
 */
class LostRace extends Error {
  constructor() {
    super('another attempt claimed this write first');
    this.name = 'LostRace';
  }
}

/**
 * Turn whatever a gate threw into one of the five outcomes (§B.3, §B.5).
 *
 * Exported because the QA phases test it directly: the mapping from a real
 * thrown error to a park reason is the part of this contract most likely to
 * rot quietly when a gate's error shape changes.
 */
export function classifyFailure(error: unknown, attempts: number): Classification {
  // A domain module can label its own error without importing this file.
  const tagged = error as { parkReason?: ParkReason; rejectReason?: ParkReason };
  if (tagged?.rejectReason) {
    return { outcome: 'REJECTED', reason: tagged.rejectReason, detail: messageOf(error) };
  }
  if (tagged?.parkReason) {
    return { outcome: 'PARKED', reason: tagged.parkReason, detail: messageOf(error) };
  }

  // D7 — the clearance the write was made under is gone or expired (§B.5.1).
  if (error instanceof LineClearanceBlockedError) {
    return {
      outcome: 'PARKED',
      reason: error.reason === 'EXPIRED' ? 'CLEARANCE_EXPIRED' : 'CLEARANCE_MISSING',
      detail: error.message,
    };
  }

  // Appendix A — the phase moved while the write sat in the queue (§B.5.2/3).
  if (isJobPhaseError(error)) {
    const reason = (error as { reason?: string }).reason;
    switch (reason) {
      // The transition already happened. It succeeded; retire it, do not park it.
      case 'ALREADY_IN_STATE':
        return { outcome: 'DUPLICATE', detail: error.message };
      case 'NO_ACTIVE_PHASE':
        return { outcome: 'PARKED', reason: 'PHASE_SIGNED_OFF', detail: error.message };
      case 'AMBIGUOUS_ACTIVE_PHASE':
        return { outcome: 'PARKED', reason: 'PHASE_AMBIGUOUS', detail: error.message };
      default:
        return { outcome: 'PARKED', reason: 'PHASE_NOT_ACTIVE', detail: error.message };
    }
  }

  // The actor lost the right between tap and sync (§B.5.6). Never applied
  // under somebody else's authority.
  if (isMisForbiddenError(error)) {
    return { outcome: 'PARKED', reason: 'FORBIDDEN', detail: error.message };
  }

  const code = (error as { code?: string })?.code;
  if (code && TRANSIENT_PRISMA_CODES.has(code)) {
    return { outcome: 'RETRY', detail: messageOf(error) };
  }

  return attempts + 1 >= MAX_UNKNOWN_ATTEMPTS
    ? { outcome: 'PARKED', reason: 'UNKNOWN', detail: messageOf(error) }
    : { outcome: 'RETRY', detail: messageOf(error) };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Is the device's clock close enough to be believed, and is this write young
 * enough to replay at all (D15, §B.4, §B.6)?
 *
 * A skewed clock parks — it is never clamped to `now()`, because clamping
 * destroys the only evidence that a device's clock is broken and quietly moves
 * a punch into a different day, shift or pay period.
 */
export async function checkTiming(
  kind: QueuedWriteKind,
  clientRecordedAt: Date,
  now: Date = new Date(),
): Promise<Classification | null> {
  const { clockSkewMinutes, maxQueueAgeHours } = await getOfflineRules();
  const ageMs = now.getTime() - clientRecordedAt.getTime();

  if (ageMs > maxQueueAgeHours * 60 * 60 * 1000) {
    return {
      outcome: 'PARKED',
      reason: 'TOO_OLD',
      detail: `Recorded ${Math.round(ageMs / 3_600_000)} hours ago, past the ${maxQueueAgeHours}-hour queue limit.`,
    };
  }

  // Only a client-recorded kind's time is load-bearing; for a server-stamped
  // kind the device's clock is evidence and cannot be wrong enough to matter.
  if (TIME_SOURCE[kind] !== 'CLIENT_RECORDED') return null;

  if (-ageMs > clockSkewMinutes * 60 * 1000) {
    return {
      outcome: 'PARKED',
      reason: 'CLOCK_SKEW',
      detail: `This device's clock is ${Math.round(-ageMs / 60_000)} minutes ahead of the server.`,
    };
  }

  return null;
}

type ApplyResult<T> = { entityType: string; entityId: string; result: T };
type Envelope = QueuedWriteEnvelope & { actorId?: string };

function storedVerdict<T>(row: {
  status: string;
  parkReason: string | null;
  parkDetail: string | null;
}): IdempotentResult<T> {
  return {
    outcome: row.status as ReplayOutcome,
    reason: (row.parkReason ?? undefined) as ParkReason | undefined,
    detail: row.parkDetail ?? undefined,
  };
}

/**
 * Run a write exactly once, however many times it arrives.
 *
 * The callback receives the transaction handle and **must** use it for the
 * business write. That is the rule the whole contract rests on (§B.7): a crash
 * between the business row and the key row makes the dedupe a lie — the row
 * exists, the key does not, and the retry duplicates it.
 *
 * **The key is claimed first, inside the same transaction** (§B.10.5). A new
 * key is a `create`; an existing row is a conditional `updateMany` on its
 * current status. A second racing attempt blocks on the row, then fails the
 * claim, rolls its business write back with it, and reads the winner's result.
 * An `upsert` would succeed for both attempts — and both business rows would
 * commit under a single key. Phase 10 shipped exactly that; this replaces it.
 *
 * The callback returns what it created, so a later duplicate can be answered
 * with the original result rather than an error (§B.3). Return only plain
 * JSON-safe values: a Decimal or a class instance does not survive the round
 * trip, and the point of `result` is that it survives.
 */
export async function runIdempotent<T>(
  envelope: Envelope,
  apply: (tx: MisTx) => Promise<ApplyResult<T>>,
  options: RunOptions = {},
): Promise<IdempotentResult<T>> {
  const { live = false, retry = false, override } = options;
  const { key, kind, payload, clientRecordedAt, deviceId, actorId } = envelope;

  // A client-supplied identifier is not trusted until it looks like one.
  if (!isIdempotencyKey(key)) {
    return { outcome: 'REJECTED', reason: 'BAD_KEY', detail: 'The idempotency key is not a UUID.' };
  }

  const existing = await db.misQueuedWrite.findUnique({ where: { key } });

  if (existing?.status === 'APPLIED') {
    // Nine replays of an applied write produce nine of these and one row.
    return { outcome: 'DUPLICATE', result: (existing.result ?? undefined) as T | undefined };
  }
  // The entry itself is wrong. A new key is the fix, never a replay of this one.
  if (existing?.status === 'REJECTED') return storedVerdict(existing);
  if (existing?.status === 'PARKED') {
    // Already in front of a human. A plain retry only for a reason whose blocker was a state
    // of the world (D17). `override` is the inbox's own audited path past everything else —
    // the caller has already separately required the right this specific reason needs.
    if (!override && !(retry && isRetryablePark(existing.parkReason))) return storedVerdict(existing);
  }

  const recordedAt = new Date(clientRecordedAt);
  const attempts = existing?.attempts ?? 0;
  const releasing = existing?.status === 'PARKED';

  // A person vouching for the time (D15) is the only way past CLOCK_SKEW/TOO_OLD — an
  // override built for that reason skips this check entirely rather than re-failing it.
  const timing = override?.skipTiming ? null : await checkTiming(kind, recordedAt);
  if (timing) {
    if (!live) await park(key, envelope, attempts, timing);
    return timing;
  }

  try {
    const applied = await db.$transaction(async (tx) => {
      // 1. CLAIM the key, in this transaction.
      if (!existing) {
        await tx.misQueuedWrite.create({
          data: {
            key,
            kind,
            status: 'IN_FLIGHT',
            payload: payload as Prisma.InputJsonValue,
            clientRecordedAt: recordedAt,
            deviceId: deviceId ?? null,
            actorId: actorId ?? null,
            attempts: attempts + 1,
            lastAttemptAt: new Date(),
          },
        });
      } else {
        const claim = await tx.misQueuedWrite.updateMany({
          where: { key, status: existing.status },
          data: { status: 'IN_FLIGHT', attempts: attempts + 1, lastAttemptAt: new Date() },
        });
        if (claim.count === 0) throw new LostRace();
      }

      // 2. The business write — same transaction, so a lost race takes it with it.
      const out = await apply(tx);

      // 3. Finalise. Stale park fields are cleared: an applied row must not still
      //    say it is held. A released park records who released it and when.
      const finalise = {
        status: 'APPLIED' as const,
        result: out.result as Prisma.InputJsonValue,
        entityType: out.entityType,
        entityId: out.entityId,
        appliedAt: new Date(),
        parkReason: null,
        parkDetail: null,
        ...(releasing
          ? {
              resolvedById: override?.by ?? actorId ?? null,
              resolvedAt: new Date(),
              resolutionNote: override?.note ?? 'Released by a retry after the blocker was resolved.',
            }
          : {}),
      };
      await tx.misQueuedWrite.update({ where: { key }, data: finalise });
      return out;
    });

    return { outcome: 'APPLIED', result: applied.result };
  } catch (error) {
    // Another attempt claimed the key first. Its answer is the answer.
    if (error instanceof LostRace || (error as { code?: string })?.code === 'P2002') {
      const winner = await db.misQueuedWrite.findUnique({ where: { key } });
      if (winner?.status === 'APPLIED') {
        return { outcome: 'DUPLICATE', result: (winner.result ?? undefined) as T | undefined };
      }
      if (winner && (winner.status === 'PARKED' || winner.status === 'REJECTED')) {
        return storedVerdict(winner);
      }
      return { outcome: 'RETRY', detail: 'Another attempt at this write is still in progress.' };
    }

    const classified = classifyFailure(error, attempts);
    if (classified.outcome === 'DUPLICATE') return classified as IdempotentResult<T>;
    if (classified.outcome === 'RETRY') {
      if (!live) await touchAttempt(key, envelope, attempts, classified.detail);
      return classified;
    }
    if (!live) await park(key, envelope, attempts, classified);
    return classified;
  }
}

/**
 * Record the park durably, with the payload.
 *
 * Durable server-side and not only on the device, because a parked write that
 * lived on a lost, wiped or forgotten tablet would be a silently lost
 * production record — the failure this whole contract exists to prevent
 * (§B.7). The inbox phase reads exactly these rows.
 */
async function park(key: string, envelope: Envelope, attempts: number, classified: Classification) {
  const status = classified.outcome === 'REJECTED' ? 'REJECTED' : 'PARKED';
  const base = {
    status,
    parkReason: classified.reason ?? null,
    parkDetail: classified.detail ?? null,
    attempts: attempts + 1,
    lastAttemptAt: new Date(),
  } as const;

  await db.misQueuedWrite.upsert({
    where: { key },
    create: {
      key,
      kind: envelope.kind,
      payload: envelope.payload as Prisma.InputJsonValue,
      clientRecordedAt: new Date(envelope.clientRecordedAt),
      deviceId: envelope.deviceId ?? null,
      actorId: envelope.actorId ?? null,
      ...base,
    },
    update: base,
  });
}

/** A retryable attempt leaves a trail without changing the verdict. */
async function touchAttempt(key: string, envelope: Envelope, attempts: number, detail?: string) {
  await db.misQueuedWrite.upsert({
    where: { key },
    create: {
      key,
      kind: envelope.kind,
      status: 'IN_FLIGHT',
      payload: envelope.payload as Prisma.InputJsonValue,
      parkDetail: detail ?? null,
      clientRecordedAt: new Date(envelope.clientRecordedAt),
      deviceId: envelope.deviceId ?? null,
      actorId: envelope.actorId ?? null,
      attempts: attempts + 1,
      lastAttemptAt: new Date(),
    },
    update: { attempts: attempts + 1, lastAttemptAt: new Date(), parkDetail: detail ?? null },
  });
}

// ---------------------------------------------------------------------------
// Phase 23 · the parked-writes inbox (Appendix B §B.7)
// ---------------------------------------------------------------------------

/**
 * Which domain read permission a kind's own data belongs to (D-guide Phase 23's own
 * warning, F-13): `queue.review` is the door into the inbox at all, but a Super
 * Attendance Operator holds `queue.review` + `attendance.read`, not `production.read`
 * — so a production-log park must never reach them just because they hold the one
 * inbox permission. Every `QueuedWriteKind` must have an entry; a new kind with none
 * fails at the type level (Record over the exact union), not silently at runtime.
 */
export const KIND_READ_PERMISSION: Record<QueuedWriteKind, MisAction> = {
  'production.log': 'production.read',
  'production.waste_reason': 'production.read',
  'attendance.punch_in': 'attendance.read',
  'attendance.punch_out': 'attendance.read',
};

export type ParkedWriteRow = {
  key: string;
  kind: QueuedWriteKind;
  /** The screen tells PARKED (the world must change) from REJECTED (the entry itself is
   * wrong — discard only, per §B.10.4's own table) by this, never by guessing from the reason. */
  status: 'PARKED' | 'REJECTED';
  payload: unknown;
  parkReason: ParkReason | null;
  parkDetail: string | null;
  clientRecordedAt: Date | null;
  deviceId: string | null;
  actorId: string | null;
  attempts: number;
  firstSeenAt: Date;
  lastAttemptAt: Date | null;
};

/** The kinds this caller may see at all, past the base `queue.review` door. */
async function visibleKindsFor(role: Parameters<typeof can>[0]): Promise<QueuedWriteKind[]> {
  return QUEUEABLE_KINDS.filter((kind) => can(role, KIND_READ_PERMISSION[kind]));
}

/** The stored row is `kind`/`parkReason` as plain strings (no DB enum); narrow at the boundary. */
function toParkedWriteRow(row: {
  key: string; kind: string; status: string; payload: unknown; parkReason: string | null; parkDetail: string | null;
  clientRecordedAt: Date | null; deviceId: string | null; actorId: string | null; attempts: number;
  firstSeenAt: Date; lastAttemptAt: Date | null;
}): ParkedWriteRow {
  return {
    key: row.key,
    kind: row.kind as QueuedWriteKind,
    status: row.status as 'PARKED' | 'REJECTED',
    payload: row.payload,
    parkReason: row.parkReason as ParkReason | null,
    parkDetail: row.parkDetail,
    clientRecordedAt: row.clientRecordedAt,
    deviceId: row.deviceId,
    actorId: row.actorId,
    attempts: row.attempts,
    firstSeenAt: row.firstSeenAt,
    lastAttemptAt: row.lastAttemptAt,
  };
}

/**
 * Every write still stuck in front of a human: `PARKED` (the world must change) and
 * `REJECTED` (the entry itself is wrong) both belong here — `APPLIED`/`DUPLICATE`/
 * `IN_FLIGHT`/`RETRY` are not stuck. `resolvedAt: null` excludes anything already
 * closed out, including a `BADGE_UNKNOWN` the tablet's own Fix already resolved
 * (D23) — this inbox is for what is STILL waiting, not a history of every park ever.
 */
export async function listParkedWrites(): Promise<ParkedWriteRow[]> {
  const actor = await requirePermission('queue.review');
  const kinds = await visibleKindsFor(actor.role);
  if (kinds.length === 0) return [];
  const rows = await db.misQueuedWrite.findMany({
    where: { status: { in: ['PARKED', 'REJECTED'] }, resolvedAt: null, kind: { in: kinds } },
    orderBy: { firstSeenAt: 'asc' },
  });
  return rows.map(toParkedWriteRow);
}

/**
 * One parked write's full detail — same visibility rule as the list, so a caller
 * cannot reach a row by key that the list would never have shown them.
 */
export async function getParkedWriteDetail(key: string): Promise<ParkedWriteRow | null> {
  const actor = await requirePermission('queue.review');
  const row = await db.misQueuedWrite.findUnique({ where: { key } });
  if (!row) return null;
  if (!can(actor.role, KIND_READ_PERMISSION[row.kind as QueuedWriteKind])) return null;
  return toParkedWriteRow(row);
}

/**
 * `queue.review` alone may see and discard with a reason — never apply something the
 * caller could not have applied themselves (Appendix B §B.7). Both `PARKED` and
 * `REJECTED` rows may be discarded: a `REJECTED` entry can never be applied at all —
 * its only resolution is a fresh entry under a new key (§B.10.4's own table).
 */
export async function discardParkedWrite(key: string, reason: string): Promise<ParkedWriteRow> {
  const actor = await requirePermission('queue.review');
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new Error('A reason of at least three characters is required to discard a parked write.');
  }
  const row = await db.misQueuedWrite.findUnique({ where: { key } });
  if (!row) throw new Error(`No parked write found for key ${key}.`);
  const kindPermission = KIND_READ_PERMISSION[row.kind as QueuedWriteKind];
  if (!can(actor.role, kindPermission)) throw new MisForbiddenError(kindPermission, key);
  if (row.status !== 'PARKED' && row.status !== 'REJECTED') {
    throw new Error(`This write is ${row.status.toLowerCase()}, not stuck — nothing to discard.`);
  }
  if (row.resolvedAt) throw new Error('This write was already resolved.');

  const updated = await db.misQueuedWrite.update({
    where: { key },
    data: { resolvedById: actor.userId, resolvedAt: new Date(), resolutionNote: trimmed },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'queue.discard',
    entity: 'MisQueuedWrite',
    entityId: key,
    before: { status: row.status, parkReason: row.parkReason },
    after: { resolutionNote: trimmed },
  });
  return toParkedWriteRow(updated);
}
