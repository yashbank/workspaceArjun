/**
 * The offline write vocabulary — shared by the client queue and the server,
 * pure, no Prisma and no React.
 *
 * The contract this implements is `docs/DEVELOPMENT_GUIDE.md` **Appendix B**.
 * Both sides must agree on the key format, the kinds, the outcomes and the
 * park reasons, which is the whole reason this file is not two files.
 */

/** Every write that may be queued (Appendix B §B.1). Anything absent is online-only. */
export const QUEUEABLE_KINDS = [
  'production.log',
  'production.waste_reason',
  'attendance.punch_in',
  'attendance.punch_out',
] as const;

export type QueuedWriteKind = (typeof QUEUEABLE_KINDS)[number];

export function isQueueableKind(value: unknown): value is QueuedWriteKind {
  return typeof value === 'string' && (QUEUEABLE_KINDS as readonly string[]).includes(value);
}

/**
 * Whose clock decides this kind's business time (**D15**).
 *
 * `CLIENT_RECORDED` — the human acted at a moment the device knows and the
 * server never will: a punch at 06:04 that syncs at 07:41 is a 06:04 punch.
 * `SERVER_STAMPED` — the record's time is the moment it applies, and no client
 * value may reach it.
 *
 * Sign-off is deliberately absent from this map because it is not queueable at
 * all (Appendix B §B.1).
 */
export const TIME_SOURCE: Record<QueuedWriteKind, 'CLIENT_RECORDED' | 'SERVER_STAMPED'> = {
  'production.log': 'CLIENT_RECORDED',
  'production.waste_reason': 'SERVER_STAMPED',
  'attendance.punch_in': 'CLIENT_RECORDED',
  'attendance.punch_out': 'CLIENT_RECORDED',
};

/** The five outcomes of a replay attempt (Appendix B §B.3). */
export const REPLAY_OUTCOMES = ['APPLIED', 'DUPLICATE', 'RETRY', 'PARKED', 'REJECTED'] as const;
export type ReplayOutcome = (typeof REPLAY_OUTCOMES)[number];

/**
 * Why a write is parked or rejected. Machine-readable so a screen can offer
 * the right Fix; the human sentence travels beside it as `parkDetail`.
 */
export type ParkReason =
  // PARKED — was legal when queued, illegal now. The world must change.
  | 'CLEARANCE_EXPIRED'
  | 'CLEARANCE_MISSING'
  | 'PHASE_SIGNED_OFF'
  | 'PHASE_NOT_ACTIVE'
  | 'PHASE_AMBIGUOUS'
  | 'ORDER_CLOSED'
  | 'FORBIDDEN'
  | 'PREDECESSOR_PARKED'
  | 'CLOCK_SKEW'
  | 'TOO_OLD'
  // Punches (Phase 13; D20, D21). None is in RETRYABLE_PARK_REASONS — see below.
  | 'BADGE_UNKNOWN'
  | 'EMPLOYEE_INACTIVE'
  | 'CORRECTION_WINDOW_CLOSED'
  | 'UNKNOWN'
  // REJECTED — the entry itself is wrong. No passage of time fixes it.
  | 'MACHINE_MISSING'
  | 'MALFORMED'
  | 'BAD_KEY';

/**
 * The parks a plain retry may release (**D17**, Appendix B §B.10.4).
 *
 * A retry re-runs every gate and lands only if they pass — it forces nothing.
 * What this set decides is whether a *retry* is an acceptable way to release
 * the hold. These are the holds whose blocker was a state of the world a named
 * person changed on the record: a reopened order, a reopened or started phase,
 * a granted right.
 *
 * Deliberately absent, and the absence is the point:
 *  - `CLEARANCE_*` — a fresh clearance certifies the machine *now*, not the
 *    setup at the moment of the tap, so re-clear-and-retry would launder an
 *    expired clearance into a valid one (D7).
 *  - `CLOCK_SKEW` / `TOO_OLD` — only a person can vouch for a time the device
 *    got wrong (D15).
 *  - `BADGE_UNKNOWN` / `EMPLOYEE_INACTIVE` / `CORRECTION_WINDOW_CLOSED` — a punch
 *    for someone the register does not know, has retired, or for a day already
 *    closed. K2's answer to the first is a person choosing who it really was, and
 *    a correction that supersedes; a re-tap is not that (D21).
 * Those need an audited override, built by the inbox phase.
 */
export const RETRYABLE_PARK_REASONS: ReadonlySet<ParkReason> = new Set<ParkReason>([
  'ORDER_CLOSED',
  'PHASE_SIGNED_OFF',
  'PHASE_NOT_ACTIVE',
  'PHASE_AMBIGUOUS',
  'FORBIDDEN',
  'UNKNOWN',
]);

export function isRetryablePark(reason: ParkReason | string | null | undefined): boolean {
  return reason != null && RETRYABLE_PARK_REASONS.has(reason as ParkReason);
}

/** A UUID in any version — the shape the server insists on before trusting a client id. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** A key is a UUID; the alias says what the caller means. */
export function isIdempotencyKey(value: unknown): value is string {
  return isUuid(value);
}

/**
 * A new key, **generated at the tap** and carried unchanged through every
 * retry (Appendix B §B.2).
 *
 * Random per *action*, never a hash of the payload: two genuinely distinct
 * identical entries — 100 sheets at 14:00 and another 100 at 14:20, same
 * machine, same order — must produce two rows. A content hash would silently
 * collapse them into one. Do not "improve" this into a hash.
 *
 * `crypto.randomUUID` is present in every target browser and in Node, so this
 * costs no dependency (§2: no new dependencies, ever).
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** The envelope the client stores and the server receives. */
export type QueuedWriteEnvelope<TPayload = unknown> = {
  key: string;
  kind: QueuedWriteKind;
  payload: TPayload;
  /** What the device's clock said when the human acted. Never rounded or corrected (D15). */
  clientRecordedAt: string;
  deviceId?: string;
  /**
   * The user id at the moment of the tap. At replay the signed-in user must be
   * this person, or the write parks — it is never re-attributed to whoever
   * happens to be signed in when the sync runs (§B.5.6, §B.10.2). A claim can
   * only ever equal the caller's own id to pass, so it gains nobody anything.
   */
  queuedBy?: string;
};

/**
 * Errors carrying one of these is how a domain module tells the classifier what
 * to do without importing it — `production.ts` throwing "order closed" does not
 * need to know the queue exists.
 */
export type ParkableError = Error & { parkReason?: ParkReason };
export type RejectableError = Error & { rejectReason?: ParkReason };

/** Throw this when the world must change before the write can land. */
export function parkable(reason: ParkReason, message: string): ParkableError {
  const error = new Error(message) as ParkableError;
  error.parkReason = reason;
  return error;
}

/** Throw this when the entry itself is wrong and waiting will not fix it. */
export function rejectable(reason: ParkReason, message: string): RejectableError {
  const error = new Error(message) as RejectableError;
  error.rejectReason = reason;
  return error;
}
