import {
  approvalRefusal,
  isDocVersionType,
  nextVersionNumber,
  type DocVersionStatus,
  type DocVersionType,
} from '@/lib/mis/document-version';
import { latestVerdict, type VerdictCheck } from '@/lib/mis/qc-verdict';
import { parseSnapshot, SnapshotUnreadableError, sameSnapshotContent, type DocSnapshot } from '@/lib/mis/document-snapshot';
import type { Prisma } from '@/generated/prisma/client';
import { can, type MisAction } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { MisForbiddenError, requirePermission, type MisActor } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { captureDocumentSnapshot } from '@/server/mis/document-snapshots';

/**
 * R2-46 — versioned COA and job-card issues with a two-level sign-off (MisDocumentVersion).
 *
 * `refId` is the order id for both types (D9: the order IS the job card; a COA certifies an order).
 *
 *  - read:    `orders.read` — anyone who can open the print page sees its version and status.
 *  - prepare: `qc.write` for a COA, `production.write` for a job card — the person issuing it.
 *  - approve: `approvals.read` (Admin and Owner only), and never the Admin who prepared it (the Owner may approve their own, R2-155).
 *  - update to latest: `approvals.read` (Admin and Owner only), on the newest APPROVED version.
 *
 * Snapshot (R2-46 follow-up): issuing a version captures the document's rendered data; approving
 * re-captures it (the approver signs what the page showed) and freezes it. Nothing ever writes the
 * snapshot of an APPROVED row again, so its reprint is stable. A legacy APPROVED row with no
 * snapshot prints live with a note until "Update to latest" issues the next version.
 */
const PREPARE_ACTION: Record<DocVersionType, MisAction> = { COA: 'qc.write', JOB_CARD: 'production.write' };

export type DocumentVersionRow = {
  id: string;
  version: number;
  status: DocVersionStatus;
  preparedByName: string | null;
  preparedAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  notes: string | null;
  /** A frozen copy is stored (an APPROVED row with one prints from it). */
  hasSnapshot?: boolean;
  /** May the viewer approve this row (second level). */
  canApprove: boolean;
  /** May the viewer discard this PREPARED row: its preparer, an Admin or the Owner (R2-158). */
  canVoid?: boolean;
};

export type DocumentVersionView = {
  docType: DocVersionType;
  refId: string;
  /** Newest first. */
  versions: DocumentVersionRow[];
  latest: DocumentVersionRow | null;
  /** May the viewer issue the next version (first level). */
  canPrepare: boolean;
  /** May the viewer issue V(n+1) from live data off the newest APPROVED version (Admin/Owner). */
  canUpdateToLatest?: boolean;
};

function assertType(docType: string): asserts docType is DocVersionType {
  if (!isDocVersionType(docType)) throw new Error('Unknown document type.');
}

async function assertOrderExists(refId: string) {
  const order = await db.misOrder.findUnique({ where: { id: refId }, select: { id: true } });
  if (!order) throw new Error('Order not found.');
}

async function namesFor(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await db.userProfile.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map((rows ?? []).map((r) => [r.id, r.name ?? '—']));
}

export async function getDocumentVersionView(docType: DocVersionType, refId: string): Promise<DocumentVersionView> {
  const actor = await requirePermission('orders.read');
  assertType(docType);
  const rows = await db.misDocumentVersion.findMany({ where: { docType, refId }, orderBy: { version: 'desc' } });
  const names = await namesFor((rows ?? []).flatMap((r) => [r.preparedById, r.approvedById]));
  // R2-157: only the newest version that is not discarded may be approved.
  const newestId = (rows ?? []).find((r) => r.status !== 'VOID')?.id;
  const versions: DocumentVersionRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status as DocVersionStatus,
    preparedByName: r.preparedById ? (names.get(r.preparedById) ?? null) : null,
    preparedAt: r.preparedAt.toISOString(),
    approvedByName: r.approvedById ? (names.get(r.approvedById) ?? null) : null,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    notes: r.notes,
    hasSnapshot: r.snapshot != null,
    canVoid: r.status === 'PREPARED' && canVoidRow(actor, docType, r.preparedById),
    canApprove:
      r.id === newestId &&
      can(actor.role, 'approvals.read') &&
      approvalRefusal({ role: actor.role, actorId: actor.userId, preparedById: r.preparedById, status: r.status as DocVersionStatus }) === null,
  }));
  // A discarded (VOID) version is history only: the live "latest" is the newest one that is not.
  const latest = versions.find((v) => v.status !== 'VOID') ?? null;
  return {
    docType,
    refId,
    versions,
    latest,
    canPrepare: can(actor.role, PREPARE_ACTION[docType]),
    canUpdateToLatest: latest?.status === 'APPROVED' && isApproverRole(actor.role) && can(actor.role, 'approvals.read'),
  };
}

const isApproverRole = (role: string | null | undefined) => role === 'ADMIN' || role === 'OWNER';

/** R2-158: the preparer (who still holds the prepare permission), an Admin or the Owner. */
function canVoidRow(actor: Pick<MisActor, 'role' | 'userId'>, docType: DocVersionType, preparedById: string | null): boolean {
  if (isApproverRole(actor.role) && can(actor.role, 'approvals.read')) return true;
  return preparedById != null && preparedById === actor.userId && can(actor.role, PREPARE_ACTION[docType]);
}

/** The newest version of a document that has not been discarded (VOID). */
async function newestLiveVersion(docType: DocVersionType, refId: string) {
  const all = await db.misDocumentVersion.findMany({ where: { docType, refId }, select: { version: true, status: true } });
  return (all ?? []).filter((r) => r.status !== 'VOID').sort((a, b) => b.version - a.version)[0] ?? null;
}

/**
 * The frozen copy of one version, or null when it has none. Throws SnapshotUnreadableError when a stored
 * snapshot cannot be read (the print pages show an inline alert, R2-160): a corrupt frozen copy must not print as if it were the approved document.
 */
export async function getDocumentVersionSnapshot(docType: DocVersionType, refId: string, versionId: string): Promise<DocSnapshot | null> {
  await requirePermission('orders.read');
  assertType(docType);
  const row = await db.misDocumentVersion.findUnique({ where: { id: versionId } });
  if (!row || row.docType !== docType || row.refId !== refId) throw new Error('That document version no longer exists.');
  if (row.snapshot == null) return null;
  const snap = parseSnapshot(row.snapshot, docType);
  if (!snap) throw new SnapshotUnreadableError();
  return snap;
}

const asJson = (s: DocSnapshot) => s as unknown as Prisma.InputJsonValue;

/** Insert V(max+1) as PREPARED with a fresh snapshot. The unique index rejects a concurrent double-issue. */
async function issueNext(actorId: string, docType: DocVersionType, refId: string, notes: string | null) {
  const snapshot = await captureDocumentSnapshot(docType, refId);
  const existing = await db.misDocumentVersion.findMany({ where: { docType, refId }, select: { version: true } });
  const version = nextVersionNumber(existing ?? []);
  let rec;
  try {
    rec = await db.misDocumentVersion.create({
      data: { docType, refId, version, status: 'PREPARED', preparedById: actorId, notes, snapshot: asJson(snapshot) },
    });
  } catch (error) {
    // Two issues raced for the same V(n+1): the unique index let one through. Refuse the other in words.
    if ((error as { code?: unknown } | null)?.code === 'P2002') {
      throw new Error(`V${version} was just issued by someone else — reload the page and check it before issuing again.`);
    }
    throw error;
  }
  return { rec, version };
}

/**
 * First level: issue the next version (V1, V2, …) as PREPARED. A reprint after a change is a new
 * version; the unique (docType, refId, version) index makes a concurrent double-issue fail loudly
 * rather than mint two V3s.
 */
export async function prepareDocumentVersion(docType: DocVersionType, refId: string, notes?: string) {
  // An unknown type has no PREPARE_ACTION, and an undefined action is refused for every role.
  const actor = await requirePermission(PREPARE_ACTION[docType]);
  assertType(docType);
  await assertOrderExists(refId);
  // R2-156: one pending version at a time. Approve or discard V(n) before issuing V(n+1).
  const live = await newestLiveVersion(docType, refId);
  if (live?.status === 'PREPARED') {
    throw new Error(`V${live.version} is still waiting for approval. Approve or discard it before issuing another version.`);
  }
  const { rec, version } = await issueNext(actor.userId, docType, refId, notes?.trim() || null);
  await logAuditEvent({
    actorId: actor.userId,
    action: 'DOC_VERSION_PREPARE',
    entity: 'MisDocumentVersion',
    entityId: rec.id,
    after: { docType, refId, version, status: 'PREPARED' },
  });
  return rec;
}

/** Second level: an Admin or the Owner, not the preparer, approves a PREPARED version. */
export async function approveDocumentVersion(versionId: string) {
  const actor = await requirePermission('approvals.read');
  const row = await db.misDocumentVersion.findUnique({ where: { id: versionId } });
  if (!row) throw new Error('That document version no longer exists.');
  const refusal = approvalRefusal({ role: actor.role, actorId: actor.userId, preparedById: row.preparedById, status: row.status as DocVersionStatus });
  if (refusal) throw new Error(refusal);
  // R2-157: approving an old draft would leave a newer unapproved one behind. Newest only.
  const live = await newestLiveVersion(row.docType as DocVersionType, row.refId);
  if (live && live.version > row.version) throw new Error(`Only the newest version (V${live.version}) can be approved.`);
  // Freeze what the approver saw: a PREPARED version prints live, so re-capture now.
  const snapshot = await captureDocumentSnapshot(row.docType as DocVersionType, row.refId);
  if (row.docType === 'COA') {
    // R2-159: a certificate must not be signed off for an unfinished order or an unresolved failed check.
    // Judged on the fresh capture (what the approver sees and what gets frozen); latestVerdict is the
    // same rule the print page uses, so a failure fixed by a later PASS on the same stage + parameter is fine.
    const coa = snapshot as unknown as { order: { status?: string }; qcLogs: VerdictCheck[] };
    // R2-338: approval is allowed from IN_PRODUCTION on (the truck must not leave with a draft); earlier statuses are refused.
    if (!['IN_PRODUCTION', 'COMPLETED', 'DELIVERED'].includes(coa.order.status ?? '')) {
      throw new Error('This certificate cannot be approved yet: the order is not in production. Start production first.');
    }
    if (latestVerdict(coa.qcLogs ?? []).overall === 'FAIL') {
      throw new Error('This certificate cannot be approved: a failed quality check has not been re-inspected and passed.');
    }
  }
  const issued = row.snapshot == null ? null : parseSnapshot(row.snapshot, row.docType as DocVersionType);
  const now = new Date();
  // Conditional on PREPARED so two approvers racing cannot both stamp it (and an APPROVED snapshot is never rewritten).
  const updated = await db.misDocumentVersion.updateMany({
    where: { id: versionId, status: 'PREPARED' },
    data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: now, snapshot: asJson(snapshot) },
  });
  if (!updated || updated.count === 0) throw new Error('This version is already approved.');
  await logAuditEvent({
    actorId: actor.userId,
    action: 'DOC_VERSION_APPROVE',
    entity: 'MisDocumentVersion',
    entityId: versionId,
    before: { status: 'PREPARED' },
    after: {
      docType: row.docType,
      refId: row.refId,
      version: row.version,
      status: 'APPROVED',
      snapshotCapturedAt: snapshot.capturedAt,
      // Did the order / QC / production data move between issue and approval?
      // R2-155: the Owner approved a version they prepared themselves.
      selfApproved: row.preparedById != null && row.preparedById === actor.userId,
      changedSinceIssued: issued ? !sameSnapshotContent(issued, snapshot) : null,
    },
  });
  return { ...row, status: 'APPROVED' as const, approvedById: actor.userId, approvedAt: now, snapshot };
}

/**
 * "Update to latest" on an APPROVED version: an Admin or the Owner issues V(n+1) as PREPARED from the
 * current live data. No reason needed. It needs a second approver like any version (the issuer is its
 * preparer). The old approved version and its snapshot stay untouched and viewable. Only the newest
 * version may be updated, so a pending V(n+1) is not silently duplicated.
 */
export async function updateDocumentVersionToLatest(versionId: string) {
  const actor = await requirePermission('approvals.read');
  if (!isApproverRole(actor.role)) throw new Error('Only an Admin or the Owner can update a document to latest.');
  const row = await db.misDocumentVersion.findUnique({ where: { id: versionId } });
  if (!row) throw new Error('That document version no longer exists.');
  if (row.status !== 'APPROVED') throw new Error('Only an approved version can be updated to latest.');
  const docType = row.docType as DocVersionType;
  assertType(docType);
  const newest = (await newestLiveVersion(docType, row.refId))?.version ?? 0;
  if (newest > row.version) throw new Error(`V${newest} is already issued — open it instead.`);
  await assertOrderExists(row.refId);
  const { rec, version } = await issueNext(actor.userId, docType, row.refId, `Updated to latest from V${row.version}`);
  await logAuditEvent({
    actorId: actor.userId,
    action: 'DOC_VERSION_UPDATE_TO_LATEST',
    entity: 'MisDocumentVersion',
    entityId: rec.id,
    before: { version: row.version, status: 'APPROVED', hadSnapshot: row.snapshot != null },
    after: { docType, refId: row.refId, version, status: 'PREPARED', fromVersionId: row.id },
  });
  return rec;
}

/**
 * R2-158: discard a PREPARED version (soft void: the row stays, as VOID, with the reason in the audit
 * log). Its preparer, an Admin or the Owner may do it. An APPROVED version is never voided; issue a
 * new version instead. The voided number is not reused, so V2 stays V2 in the history.
 */
export async function voidDocumentVersion(versionId: string, reason: string) {
  const actor = await requirePermission('orders.read');
  const row = await db.misDocumentVersion.findUnique({ where: { id: versionId } });
  if (!row) throw new Error('That document version no longer exists.');
  const docType = row.docType as DocVersionType;
  assertType(docType);
  if (!canVoidRow(actor, docType, row.preparedById)) throw new MisForbiddenError('approvals.read', 'discard a document version');
  const why = reason?.trim();
  if (!why) throw new Error('Give a reason for discarding this version.');
  if (row.status !== 'PREPARED') throw new Error('Only a version still waiting for approval can be discarded.');
  const updated = await db.misDocumentVersion.updateMany({ where: { id: versionId, status: 'PREPARED' }, data: { status: 'VOID' } });
  if (!updated || updated.count === 0) throw new Error('Only a version still waiting for approval can be discarded.');
  await logAuditEvent({
    actorId: actor.userId,
    action: 'DOC_VERSION_VOID',
    entity: 'MisDocumentVersion',
    entityId: versionId,
    before: { status: 'PREPARED' },
    after: { docType, refId: row.refId, version: row.version, status: 'VOID', reason: why },
  });
  return { ...row, status: 'VOID' as const };
}
