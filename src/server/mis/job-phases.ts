import type { MisJobPhaseStatus } from '@/generated/prisma/enums';
import { BPR_WORKFLOW, processNameKey } from '@/lib/mis/bpr-workflow';
import { db } from '@/server/db';
import { requirePermission, type MisActor } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';

/**
 * The phase sign-off and handover gate.
 *
 * The specification is DEVELOPMENT_GUIDE.md **Appendix A** — states, the legal
 * transitions, who may perform each, the sequential rule, and the database
 * constraints that back all of it up. If this file and Appendix A disagree,
 * this file is wrong.
 *
 * TRANSITIONS below is the one and only transition table. The moment a second
 * `if (phase.status === ...)` gate appears somewhere else, the two drift and
 * the gate has a hole (MIS-145).
 *
 * This module deliberately never calls `assertLineCleared` (D7). Line clearance
 * asks "is this machine fit to run"; the phase gate asks "is this order's route
 * at this step". They are independent preconditions on the same write and are
 * kept that way so either can change without the other (Appendix A §A.8).
 */

/** Work may be recorded against a phase in these states, and only these. */
const ACTIVE_STATUSES: MisJobPhaseStatus[] = ['IN_PROGRESS', 'REOPENED'];

/**
 * REOPENED is active exactly like IN_PROGRESS and distinct from it in the
 * record — a phase signed once and withdrawn must never again look like one
 * that was never signed (Appendix A §A.2).
 */
export function isActiveStatus(status: MisJobPhaseStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

type TransitionVerb =
  | 'startPhase'
  | 'signOffPhase'
  | 'markNotApplicable'
  | 'restorePhase'
  | 'reopenPhase';

/** Appendix A §A.3. Anything not in this table is illegal for everybody. */
const TRANSITIONS: ReadonlyArray<{
  from: MisJobPhaseStatus;
  to: MisJobPhaseStatus;
  verb: TransitionVerb;
}> = [
  { from: 'PENDING', to: 'IN_PROGRESS', verb: 'startPhase' },
  { from: 'PENDING', to: 'NOT_APPLICABLE', verb: 'markNotApplicable' },
  { from: 'IN_PROGRESS', to: 'SIGNED_OFF', verb: 'signOffPhase' },
  { from: 'IN_PROGRESS', to: 'NOT_APPLICABLE', verb: 'markNotApplicable' },
  { from: 'SIGNED_OFF', to: 'REOPENED', verb: 'reopenPhase' },
  { from: 'NOT_APPLICABLE', to: 'PENDING', verb: 'restorePhase' },
  { from: 'REOPENED', to: 'SIGNED_OFF', verb: 'signOffPhase' },
];

export type JobPhaseRefusal =
  | 'ALREADY_IN_STATE'
  | 'ILLEGAL_TRANSITION'
  | 'PREVIOUS_PHASE_NOT_SIGNED_OFF'
  | 'NOT_THE_IN_CHARGE'
  | 'NO_IN_CHARGE'
  | 'NO_PRODUCTION_RECORDED'
  | 'WASTE_REASON_MISSING'
  | 'QC_FAILURE_UNACKNOWLEDGED'
  | 'PRODUCTION_ALREADY_RECORDED'
  | 'LATER_PHASE_STARTED'
  | 'REASON_REQUIRED'
  | 'NO_ACTIVE_PHASE'
  | 'AMBIGUOUS_ACTIVE_PHASE'
  | 'PHASE_NOT_FOUND';

/**
 * A refused transition, carrying why.
 *
 * `reason` is what callers branch on; `message` is what a person reads and it
 * always names the next action — the blocking phase and the person who can
 * unblock it (MIS-146). A refusal with no next action produces a phone call,
 * and enough phone calls produce a workaround.
 *
 * Phase 11: `ALREADY_IN_STATE` is your replay signal. A re-delivered sign-off
 * that refuses with it has already succeeded — retire it from the queue rather
 * than parking it.
 */
export class JobPhaseError extends Error {
  constructor(
    readonly reason: JobPhaseRefusal,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'JobPhaseError';
  }
}

export function isJobPhaseError(error: unknown): error is JobPhaseError {
  return error instanceof JobPhaseError || (error as Error)?.name === 'JobPhaseError';
}

function assertTransition(from: MisJobPhaseStatus, to: MisJobPhaseStatus, verb: TransitionVerb) {
  if (from === to) {
    throw new JobPhaseError(
      'ALREADY_IN_STATE',
      `This phase is already ${humanStatus(to)}.`,
      { from, to },
    );
  }
  const legal = TRANSITIONS.some((t) => t.from === from && t.to === to && t.verb === verb);
  if (!legal) {
    throw new JobPhaseError(
      'ILLEGAL_TRANSITION',
      `A phase cannot go from ${humanStatus(from)} to ${humanStatus(to)}.`,
      { from, to, verb },
    );
  }
}

function humanStatus(status: MisJobPhaseStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const phaseInclude = {
  process: { select: { id: true, name: true, nameHi: true, code: true } },
  inCharge: { select: { id: true, name: true, employeeCode: true, userProfileId: true } },
  order: { select: { id: true, orderNumber: true } },
} as const;

type PhaseWithRefs = Awaited<ReturnType<typeof loadPhase>>;

async function loadPhase(phaseId: string) {
  const phase = await db.misJobPhase.findFirst({
    where: { id: phaseId, deletedAt: null },
    include: phaseInclude,
  });
  if (!phase) {
    throw new JobPhaseError('PHASE_NOT_FOUND', 'That phase no longer exists.', { phaseId });
  }
  return phase;
}

/** Every phase on an order, in running order. An empty list is a real answer (D10). */
export async function getPhasesForOrder(orderId: string) {
  await requirePermission('phase.read');
  return db.misJobPhase.findMany({
    where: { orderId, deletedAt: null },
    include: phaseInclude,
    orderBy: { sequence: 'asc' },
  });
}

/**
 * The previous phase that still counts — nearest lower sequence, skipping
 * NOT_APPLICABLE, ignoring soft-deleted rows. A skipped phase must never block
 * the next one (MIS-145). Mirrors the trigger's own lookup exactly.
 */
async function previousApplicablePhase(orderId: string, sequence: number) {
  return db.misJobPhase.findFirst({
    where: {
      orderId,
      deletedAt: null,
      sequence: { lt: sequence },
      status: { not: 'NOT_APPLICABLE' },
    },
    include: phaseInclude,
    orderBy: { sequence: 'desc' },
  });
}

function describeHolder(phase: { inCharge: { name: string } | null }): string {
  return phase.inCharge ? `${phase.inCharge.name}` : 'nobody yet — it needs an in-charge';
}

// ---------------------------------------------------------------------------
// Identity — D12
// ---------------------------------------------------------------------------

/**
 * Is this actor the phase's in-charge?
 *
 * The in-charge is an employee; the actor is an auth user. `userProfileId` is
 * the unique bridge, the same one `getMisRole` walks.
 */
function isInCharge(phase: PhaseWithRefs, actor: MisActor): boolean {
  return phase.inCharge?.userProfileId != null && phase.inCharge.userProfileId === actor.userId;
}

async function employeeForActor(actor: MisActor) {
  return db.misEmployee.findUnique({
    where: { userProfileId: actor.userId },
    select: { id: true, name: true },
  });
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * Start a phase. The sequential gate lives here and in the database trigger;
 * this one produces the message a person reads (MIS_UI_SPEC.md §7.1).
 *
 * An unassigned phase takes the starter as its in-charge (D12) — the default
 * that always resolves, in a factory where most supervisors have no login.
 */
export async function startPhase(phaseId: string) {
  const actor = await requirePermission('phase.write');
  const phase = await loadPhase(phaseId);
  assertTransition(phase.status, 'IN_PROGRESS', 'startPhase');

  const blocker = await previousApplicablePhase(phase.orderId, phase.sequence);
  if (blocker && blocker.status !== 'SIGNED_OFF') {
    throw new JobPhaseError(
      'PREVIOUS_PHASE_NOT_SIGNED_OFF',
      `${phase.process.name} cannot start until ${blocker.process.name} is signed off — it is still with ${describeHolder(blocker)}.`,
      { blockingPhaseId: blocker.id, blockingProcess: blocker.process.name, blockingStatus: blocker.status },
    );
  }

  const mine = await employeeForActor(actor);
  const inChargeEmployeeId = phase.inChargeEmployeeId ?? mine?.id ?? null;
  if (!inChargeEmployeeId) {
    throw new JobPhaseError(
      'NO_IN_CHARGE',
      `${phase.process.name} has no in-charge, and you have no employee record to become one. An admin must assign one before it can start.`,
      { phaseId },
    );
  }

  const rec = await db.misJobPhase.update({
    where: { id: phaseId },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      startedById: actor.userId,
      inChargeEmployeeId,
    },
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'START_PHASE',
    entity: 'MisJobPhase',
    entityId: rec.id,
    before: { status: phase.status },
    after: { status: rec.status, inChargeEmployeeId, orderId: rec.orderId, sequence: rec.sequence },
  });
  return rec;
}

export type SignOffBlocker =
  | { kind: 'NO_PRODUCTION' }
  | { kind: 'WASTE_REASON'; logId: string; loggedAt: Date; qtyWaste: number }
  | { kind: 'QC_FAILURE'; checkId: string; parameterName: string | null; checkTime: Date };

/**
 * Everything standing between this phase and a signature, as data rather than
 * an exception — so the screen can list all of them at once instead of
 * surfacing them one refused submit at a time (MIS-164).
 */
export async function getSignOffBlockers(phaseId: string): Promise<SignOffBlocker[]> {
  await requirePermission('phase.read');
  const phase = await loadPhase(phaseId);
  return collectSignOffBlockers(phase);
}

async function collectSignOffBlockers(phase: PhaseWithRefs): Promise<SignOffBlocker[]> {
  const blockers: SignOffBlocker[] = [];

  const logs = await db.misProductionLog.findMany({
    where: { jobPhaseId: phase.id },
    select: { id: true, qtyWaste: true, wasteReason: true, loggedAt: true },
    orderBy: { loggedAt: 'asc' },
  });

  if (logs.length === 0) blockers.push({ kind: 'NO_PRODUCTION' });

  for (const log of logs) {
    const waste = Number(log.qtyWaste ?? 0);
    if (waste > 0 && !log.wasteReason?.trim()) {
      blockers.push({ kind: 'WASTE_REASON', logId: log.id, loggedAt: log.loggedAt, qtyWaste: waste });
    }
  }

  for (const check of await unacknowledgedFailures(phase)) {
    blockers.push({
      kind: 'QC_FAILURE',
      checkId: check.id,
      parameterName: check.parameterName,
      checkTime: check.checkTime,
    });
  }

  return blockers;
}

/**
 * Failed QC checks belonging to this phase.
 *
 * A check is tied to a stage, not a phase — so a phase built from a BOM stage
 * owns that stage's checks, and one built without a stage owns the order's
 * unattributed checks. Acknowledged is not resolved (MIS-163): a check stays
 * FAIL for ever, and `acknowledgedAt` records that someone knew and passed the
 * job on anyway.
 */
async function unacknowledgedFailures(phase: { orderId: string; bomStageId: string | null }) {
  return db.misQcCheck.findMany({
    where: {
      orderId: phase.orderId,
      bomStageId: phase.bomStageId,
      result: 'FAIL',
      acknowledgedAt: null,
    },
    select: { id: true, parameterName: true, checkTime: true },
    orderBy: { checkTime: 'asc' },
  });
}

/**
 * Sign a phase off. **Only the in-charge** — not an admin, not the Owner
 * (D12). A signature someone else can apply is not a signature; the Owner's
 * lever is `reassignInCharge`.
 *
 * The timestamp is the server's, always. No argument carries one, and Phase 11
 * must stamp a replayed sign-off when it replays, not when it was queued.
 */
export async function signOffPhase(phaseId: string, input?: { notes?: string }) {
  const actor = await requirePermission('phase.write');
  const phase = await loadPhase(phaseId);
  assertTransition(phase.status, 'SIGNED_OFF', 'signOffPhase');

  if (!isInCharge(phase, actor)) {
    throw new JobPhaseError(
      'NOT_THE_IN_CHARGE',
      phase.inCharge
        ? `Only ${phase.inCharge.name} can sign off ${phase.process.name}. Ask an admin to re-assign it if they are unavailable.`
        : `${phase.process.name} has no in-charge, so nobody can sign it off yet. An admin must assign one.`,
      { phaseId, inCharge: phase.inCharge?.name ?? null },
    );
  }

  const blockers = await collectSignOffBlockers(phase);
  const first = blockers[0];
  if (first) throw refusalForBlocker(phase, first, blockers);

  const signedOffAt = new Date();
  const next = await nextApplicablePhase(phase.orderId, phase.sequence);
  const notifyUserId = next?.inCharge?.userProfileId ?? null;

  const rec = await db.$transaction(async (tx) => {
    const updated = await tx.misJobPhase.update({
      where: { id: phaseId },
      data: {
        status: 'SIGNED_OFF',
        signedOffAt,
        signedOffById: actor.userId,
        notes: input?.notes ?? phase.notes,
      },
    });

    // Transactional on purpose: a notification that fires on a rolled-back
    // sign-off tells the next section to start work that never unblocked.
    // A next in-charge with no login gets no row — most supervisors in this
    // factory have none, and that must not fail the sign-off.
    if (notifyUserId && next) {
      await tx.notification.create({
        data: {
          userId: notifyUserId,
          type: 'mis.phase_ready',
          payload: {
            orderId: phase.orderId,
            orderNumber: phase.order.orderNumber,
            phaseId: next.id,
            processName: next.process.name,
            previousProcessName: phase.process.name,
            signedOffAt: signedOffAt.toISOString(),
          },
        },
      });
    }

    return updated;
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'SIGN_OFF_PHASE',
    entity: 'MisJobPhase',
    entityId: rec.id,
    before: { status: phase.status },
    after: {
      status: rec.status,
      signedOffAt: signedOffAt.toISOString(),
      orderId: rec.orderId,
      sequence: rec.sequence,
      notifiedPhaseId: next?.id ?? null,
    },
  });
  return rec;
}

function refusalForBlocker(
  phase: PhaseWithRefs,
  blocker: SignOffBlocker,
  all: SignOffBlocker[],
): JobPhaseError {
  const detail = { phaseId: phase.id, blockers: all.length };
  switch (blocker.kind) {
    case 'NO_PRODUCTION':
      return new JobPhaseError(
        'NO_PRODUCTION_RECORDED',
        `Nothing has been recorded against ${phase.process.name}, so there is nothing to sign for.`,
        detail,
      );
    case 'WASTE_REASON':
      return new JobPhaseError(
        'WASTE_REASON_MISSING',
        `${all.filter((b) => b.kind === 'WASTE_REASON').length} wastage entr${all.filter((b) => b.kind === 'WASTE_REASON').length === 1 ? 'y needs' : 'ies need'} a reason before ${phase.process.name} can be signed off.`,
        detail,
      );
    case 'QC_FAILURE':
      return new JobPhaseError(
        'QC_FAILURE_UNACKNOWLEDGED',
        `${phase.process.name} has a failed quality check that has not been acknowledged. Acknowledging it records that you know about it and are passing the job on anyway.`,
        detail,
      );
  }
}

async function nextApplicablePhase(orderId: string, sequence: number) {
  return db.misJobPhase.findFirst({
    where: {
      orderId,
      deletedAt: null,
      sequence: { gt: sequence },
      status: { not: 'NOT_APPLICABLE' },
    },
    include: phaseInclude,
    orderBy: { sequence: 'asc' },
  });
}

/**
 * Take a phase off this job's route, or put a started-by-mistake one back to
 * rest. ADMIN/OWNER only — routing is a planning act (Appendix A §A.4).
 * Refused once production exists: you cannot un-happen recorded work.
 */
export async function markNotApplicable(phaseId: string, reason: string) {
  const actor = await requirePermission('phase.write');
  if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
    throw new JobPhaseError(
      'ILLEGAL_TRANSITION',
      'Only an admin or the owner can take a phase off a job card.',
      { role: actor.role },
    );
  }
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new JobPhaseError('REASON_REQUIRED', 'Skipping a phase needs a reason.', { phaseId });
  }

  const phase = await loadPhase(phaseId);
  assertTransition(phase.status, 'NOT_APPLICABLE', 'markNotApplicable');

  const recorded = await db.misProductionLog.count({ where: { jobPhaseId: phaseId } });
  if (recorded > 0) {
    throw new JobPhaseError(
      'PRODUCTION_ALREADY_RECORDED',
      `${phase.process.name} already has ${recorded} production ${recorded === 1 ? 'entry' : 'entries'} against it, so it cannot be marked not applicable. Sign it off instead.`,
      { phaseId, recorded },
    );
  }

  const rec = await db.misJobPhase.update({
    where: { id: phaseId },
    data: { status: 'NOT_APPLICABLE', notApplicableReason: trimmed },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'SKIP_PHASE',
    entity: 'MisJobPhase',
    entityId: rec.id,
    before: { status: phase.status },
    after: { status: rec.status, reason: trimmed },
  });
  return rec;
}

/**
 * Put a skipped phase back on the route. Refused once a later phase has
 * started — restoring behind work already done opens a hole in the sequence
 * the gate cannot close retroactively (Appendix A §A.3 note 2).
 */
export async function restorePhase(phaseId: string, reason: string) {
  const actor = await requirePermission('phase.write');
  if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
    throw new JobPhaseError(
      'ILLEGAL_TRANSITION',
      'Only an admin or the owner can put a phase back on a job card.',
      { role: actor.role },
    );
  }
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new JobPhaseError('REASON_REQUIRED', 'Restoring a phase needs a reason.', { phaseId });
  }

  const phase = await loadPhase(phaseId);
  assertTransition(phase.status, 'PENDING', 'restorePhase');

  const later = await db.misJobPhase.findFirst({
    where: {
      orderId: phase.orderId,
      deletedAt: null,
      sequence: { gt: phase.sequence },
      status: { in: ['IN_PROGRESS', 'SIGNED_OFF', 'REOPENED'] },
    },
    include: phaseInclude,
    orderBy: { sequence: 'asc' },
  });
  if (later) {
    throw new JobPhaseError(
      'LATER_PHASE_STARTED',
      `${later.process.name} has already started, so ${phase.process.name} cannot be put back before it.`,
      { phaseId, laterPhaseId: later.id },
    );
  }

  const rec = await db.misJobPhase.update({
    where: { id: phaseId },
    data: { status: 'PENDING', notApplicableReason: null, notes: appendNote(phase.notes, `Restored: ${trimmed}`) },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'RESTORE_PHASE',
    entity: 'MisJobPhase',
    entityId: rec.id,
    before: { status: phase.status },
    after: { status: rec.status, reason: trimmed },
  });
  return rec;
}

/**
 * Withdraw a signature. **OWNER only** (`phase.reopen`).
 *
 * Downstream phases are *flagged*, never cascaded: rewriting the status of
 * phases people have already acted on would destroy their records to tidy up
 * this one (MIS-146).
 */
export async function reopenPhase(phaseId: string, reason: string) {
  const actor = await requirePermission('phase.reopen');
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new JobPhaseError('REASON_REQUIRED', 'Reopening a signed phase needs a reason.', { phaseId });
  }

  const phase = await loadPhase(phaseId);
  assertTransition(phase.status, 'REOPENED', 'reopenPhase');

  const reopenedAt = new Date();
  const { rec, flagged } = await db.$transaction(async (tx) => {
    const updated = await tx.misJobPhase.update({
      where: { id: phaseId },
      data: {
        status: 'REOPENED',
        reopenReason: trimmed,
        reopenedAt,
        reopenedById: actor.userId,
      },
    });
    const downstream = await tx.misJobPhase.updateMany({
      where: {
        orderId: phase.orderId,
        deletedAt: null,
        sequence: { gt: phase.sequence },
        status: { not: 'NOT_APPLICABLE' },
      },
      data: { downstreamFlagged: true },
    });
    return { rec: updated, flagged: downstream.count };
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'REOPEN_PHASE',
    entity: 'MisJobPhase',
    entityId: rec.id,
    before: { status: phase.status, signedOffAt: phase.signedOffAt?.toISOString() ?? null },
    after: { status: rec.status, reason: trimmed, downstreamFlagged: flagged },
  });
  return rec;
}

/**
 * Move who signs. ADMIN/OWNER, audited, and the outgoing in-charge is on the
 * record — this is the answer to "the signer left", and the only lever a
 * manager has over a signature (D12).
 */
export async function reassignInCharge(phaseId: string, employeeId: string) {
  const actor = await requirePermission('phase.write');
  if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
    throw new JobPhaseError(
      'ILLEGAL_TRANSITION',
      'Only an admin or the owner can re-assign who signs off a phase.',
      { role: actor.role },
    );
  }
  const phase = await loadPhase(phaseId);
  if (phase.status === 'SIGNED_OFF') {
    throw new JobPhaseError(
      'ILLEGAL_TRANSITION',
      `${phase.process.name} is already signed off; re-assigning now would not change who signed it.`,
      { phaseId },
    );
  }
  const incoming = await db.misEmployee.findFirst({
    where: { id: employeeId, deletedAt: null, isActive: true },
    select: { id: true, name: true },
  });
  if (!incoming) {
    throw new JobPhaseError('NO_IN_CHARGE', 'That employee is not available to take the phase.', { employeeId });
  }

  const rec = await db.misJobPhase.update({
    where: { id: phaseId },
    data: { inChargeEmployeeId: incoming.id },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'REASSIGN_PHASE_IN_CHARGE',
    entity: 'MisJobPhase',
    entityId: rec.id,
    before: { inCharge: phase.inCharge?.name ?? null, inChargeEmployeeId: phase.inChargeEmployeeId },
    after: { inCharge: incoming.name, inChargeEmployeeId: incoming.id },
  });
  return rec;
}

// ---------------------------------------------------------------------------
// Preconditions the sign-off screen clears inline
// ---------------------------------------------------------------------------

/**
 * Record that the in-charge knows about a failed check and is passing the job
 * on anyway. This is **not** resolving it: the check stays FAIL for ever, and
 * "resolved" remains a later PASS on the same stage, which is derived and not
 * stored (MIS-163).
 */
export async function acknowledgeQcFailure(checkId: string, note?: string) {
  const actor = await requirePermission('phase.write');
  const check = await db.misQcCheck.findUnique({ where: { id: checkId } });
  if (!check) throw new JobPhaseError('PHASE_NOT_FOUND', 'That check no longer exists.', { checkId });
  if (check.result !== 'FAIL') {
    throw new JobPhaseError(
      'ILLEGAL_TRANSITION',
      'Only a failed check needs acknowledging.',
      { checkId, result: check.result },
    );
  }
  if (check.acknowledgedAt) return check;

  const rec = await db.misQcCheck.update({
    where: { id: checkId },
    data: {
      acknowledgedAt: new Date(),
      acknowledgedById: actor.userId,
      acknowledgementNote: note?.trim() || null,
    },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'ACKNOWLEDGE_QC_FAILURE',
    entity: 'MisQcCheck',
    entityId: rec.id,
    after: { acknowledgedAt: rec.acknowledgedAt?.toISOString() ?? null, note: rec.acknowledgementNote },
  });
  return rec;
}

/** Fill in a wastage reason the entry screen deliberately did not ask for (D11). */
export async function setWasteReason(productionLogId: string, reason: string) {
  const actor = await requirePermission('phase.write');
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new JobPhaseError('REASON_REQUIRED', 'A wastage reason cannot be blank.', { productionLogId });
  }
  const rec = await db.misProductionLog.update({
    where: { id: productionLogId },
    data: { wasteReason: trimmed },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'SET_WASTE_REASON',
    entity: 'MisProductionLog',
    entityId: rec.id,
    after: { wasteReason: trimmed },
  });
  return rec;
}

// ---------------------------------------------------------------------------
// The summary the signature is a claim about
// ---------------------------------------------------------------------------

export type SignOffSummary = {
  phaseId: string;
  processName: string;
  orderNumber: string;
  status: MisJobPhaseStatus;
  inChargeName: string | null;
  canSign: boolean;
  output: number;
  waste: number;
  wastePercent: number | null;
  entries: number;
  unit: string;
  /**
   * What the previous signed phase handed over, which is what this phase's
   * output is read against — the BPR's own "Received Sheets → Printed Sheets"
   * columns. Orders carry no quantity field (D13).
   */
  handedOver: { processName: string; output: number } | null;
  materials: { description: string; quantity: number; unit: string }[];
  blockers: SignOffBlocker[];
};

/** Everything the screen must show *above* the confirm action (MIS-164). */
export async function getSignOffSummary(phaseId: string): Promise<SignOffSummary> {
  const actor = await requirePermission('phase.read');
  const phase = await loadPhase(phaseId);

  const [logs, blockers, previous] = await Promise.all([
    db.misProductionLog.findMany({
      where: { jobPhaseId: phaseId },
      select: { qtyProduced: true, qtyWaste: true, unit: true },
    }),
    collectSignOffBlockers(phase),
    previousApplicablePhase(phase.orderId, phase.sequence),
  ]);

  const output = logs.reduce((sum, l) => sum + Number(l.qtyProduced), 0);
  const waste = logs.reduce((sum, l) => sum + Number(l.qtyWaste ?? 0), 0);

  let handedOver: SignOffSummary['handedOver'] = null;
  if (previous && previous.status === 'SIGNED_OFF') {
    const previousLogs = await db.misProductionLog.findMany({
      where: { jobPhaseId: previous.id },
      select: { qtyProduced: true },
    });
    handedOver = {
      processName: previous.process.name,
      output: previousLogs.reduce((sum, l) => sum + Number(l.qtyProduced), 0),
    };
  }

  const materials = phase.bomStageId
    ? (
        await db.misBomMaterial.findMany({
          where: { stageId: phase.bomStageId },
          select: { description: true, quantity: true, unit: true },
          orderBy: { seq: 'asc' },
        })
      ).map((m) => ({ description: m.description, quantity: Number(m.quantity), unit: m.unit }))
    : [];

  return {
    phaseId: phase.id,
    processName: phase.process.name,
    orderNumber: phase.order.orderNumber,
    status: phase.status,
    inChargeName: phase.inCharge?.name ?? null,
    canSign: isInCharge(phase, actor) && blockers.length === 0 && isActiveStatus(phase.status),
    output,
    waste,
    wastePercent: output + waste > 0 ? (waste / (output + waste)) * 100 : null,
    entries: logs.length,
    unit: logs[0]?.unit ?? 'KG',
    handedOver,
    materials,
    blockers,
  };
}

/**
 * "Waiting on your sign-off" — filtered in the database, never in the browser
 * (MIS-142 S8). Returns nothing for a user with no employee record, which is
 * the correct answer rather than an error.
 */
export async function listPhasesAwaitingMySignOff(limit = 5) {
  const actor = await requirePermission('phase.read');
  const mine = await employeeForActor(actor);
  if (!mine) return { total: 0, rows: [] as Awaited<ReturnType<typeof getPhasesForOrder>> };

  const where = {
    deletedAt: null,
    inChargeEmployeeId: mine.id,
    status: { in: ACTIVE_STATUSES },
  } as const;

  const [total, rows] = await Promise.all([
    db.misJobPhase.count({ where }),
    db.misJobPhase.findMany({ where, include: phaseInclude, orderBy: { startedAt: 'asc' }, take: limit }),
  ]);
  return { total, rows };
}

// ---------------------------------------------------------------------------
// Planning — the phases have to come from somewhere
// ---------------------------------------------------------------------------

/**
 * Create the eleven BPR work-flow processes that are missing from the master.
 *
 * Idempotent and name-matched: five of the eleven already exist under the
 * client's own codes, alongside thirteen more processes they use. Re-seeding
 * all eleven would duplicate real master data (Appendix A §A.1). New rows take
 * the next free `PROC-0NN`; `PROC-008` is a gap in the live sequence and is
 * never reused, because a reused code resurrects a ghost.
 */
export async function ensureBprProcesses() {
  await requirePermission('masters.write');
  const existing = await db.misProcess.findMany({ select: { id: true, name: true, code: true } });
  const byName = new Map(existing.map((p) => [processNameKey(p.name), p]));

  const used = new Set(existing.map((p) => p.code));
  let next = 20;
  const nextCode = () => {
    let code = `PROC-${String(next).padStart(3, '0')}`;
    while (used.has(code)) {
      next += 1;
      code = `PROC-${String(next).padStart(3, '0')}`;
    }
    used.add(code);
    next += 1;
    return code;
  };

  const created: string[] = [];
  for (const [index, name] of BPR_WORKFLOW.entries()) {
    if (byName.has(processNameKey(name))) continue;
    const rec = await db.misProcess.create({
      data: { code: nextCode(), name, sortOrder: 100 + index },
    });
    created.push(rec.name);
  }
  return { created, alreadyPresent: BPR_WORKFLOW.length - created.length };
}

/**
 * Lay out an order's phases — the planner ticking boxes on the BPR work flow.
 *
 * Processes not ticked are written as NOT_APPLICABLE rather than left out, so
 * the job card shows the whole route and what was skipped, and so restoring one
 * later is a transition rather than an insert into a numbered sequence.
 */
export async function planPhases(
  orderId: string,
  selection: { processId: string; applies: boolean; bomStageId?: string | null }[],
) {
  const actor = await requirePermission('phase.write');
  if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
    throw new JobPhaseError(
      'ILLEGAL_TRANSITION',
      'Only an admin or the owner can plan a job card.',
      { role: actor.role },
    );
  }

  const existing = await db.misJobPhase.count({ where: { orderId, deletedAt: null } });
  if (existing > 0) {
    throw new JobPhaseError(
      'ILLEGAL_TRANSITION',
      'This order already has a phase plan. Skip or restore individual phases instead of re-planning it.',
      { orderId, existing },
    );
  }

  const rows = selection.map((entry, index) => ({
    orderId,
    processId: entry.processId,
    bomStageId: entry.bomStageId ?? null,
    sequence: index + 1,
    status: (entry.applies ? 'PENDING' : 'NOT_APPLICABLE') as MisJobPhaseStatus,
    notApplicableReason: entry.applies ? null : 'Not on this job card',
  }));

  await db.misJobPhase.createMany({ data: rows });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'PLAN_PHASES',
    entity: 'MisOrder',
    entityId: orderId,
    after: { phases: rows.length, applicable: rows.filter((r) => r.status === 'PENDING').length },
  });
  return getPhasesForOrder(orderId);
}

// ---------------------------------------------------------------------------
// The production gate — Appendix A §A.8
// ---------------------------------------------------------------------------

/**
 * Which phase a production entry belongs to, resolved on the server.
 *
 * Returns null when the order has no phases at all (D10) — that order is
 * ungated, exactly as it was before this feature existed, and the order screen
 * says so rather than letting the silence read as a passed gate.
 *
 * Resolving here rather than on the screen is what keeps the 2-3 tap entry
 * screen unchanged and leaves D8's required machineId alone.
 */
export async function resolveJobPhaseForProduction(
  orderId: string,
  jobPhaseId?: string,
): Promise<string | null> {
  if (jobPhaseId) {
    const named = await db.misJobPhase.findFirst({
      where: { id: jobPhaseId, orderId, deletedAt: null },
      include: phaseInclude,
    });
    if (!named) {
      throw new JobPhaseError('PHASE_NOT_FOUND', 'That phase is not on this order.', { orderId, jobPhaseId });
    }
    if (!isActiveStatus(named.status)) {
      throw new JobPhaseError(
        'NO_ACTIVE_PHASE',
        `${named.process.name} is ${humanStatus(named.status)}, so production cannot be recorded against it.`,
        { phaseId: named.id, status: named.status },
      );
    }
    return named.id;
  }

  const phases = await db.misJobPhase.findMany({
    where: { orderId, deletedAt: null },
    include: phaseInclude,
    orderBy: { sequence: 'asc' },
  });
  if (phases.length === 0) return null;

  const active = phases.filter((p) => isActiveStatus(p.status));
  if (active.length === 1) return active[0].id;

  if (active.length === 0) {
    const nextUp = phases.find((p) => p.status === 'PENDING');
    throw new JobPhaseError(
      'NO_ACTIVE_PHASE',
      nextUp
        ? `No phase is running on this order. ${nextUp.process.name} is next — ${describeHolder(nextUp)} needs to start it.`
        : 'No phase is running on this order, and there is none left to start.',
      { orderId, nextPhaseId: nextUp?.id ?? null },
    );
  }

  throw new JobPhaseError(
    'AMBIGUOUS_ACTIVE_PHASE',
    `More than one phase is running on this order (${active.map((p) => p.process.name).join(', ')}). Say which one this entry belongs to.`,
    { orderId, candidates: active.map((p) => ({ id: p.id, processName: p.process.name })) },
  );
}

function appendNote(existing: string | null, addition: string): string {
  return existing ? `${existing}\n${addition}` : addition;
}
