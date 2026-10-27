import {
  approvalRefusal,
  isDocVersionType,
  nextVersionNumber,
  type DocVersionStatus,
  type DocVersionType,
} from '@/lib/mis/document-version';
import { parseSnapshot, sameSnapshotContent, type DocSnapshot } from '@/lib/mis/document-snapshot';
import type { Prisma } from '@/generated/prisma/client';
import { can, type MisAction } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
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
    canApprove:
      can(actor.role, 'approvals.read') &&
      approvalRefusal({ role: actor.role, actorId: actor.userId, preparedById: r.preparedById, status: r.status as DocVersionStatus }) === null,
  }));
  const latest = versions[0] ?? null;
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

/**
 * The frozen copy of one version, or null when it has none. Throws when a stored snapshot cannot be
 * read: a corrupt frozen copy must not print as if it were the approved document.
 */
export async function getDocumentVersionSnapshot(docType: DocVersionType, refId: string, versionId: string): Promise<DocSnapshot | null> {
  await requirePermission('orders.read');
  assertType(docType);
  const row = await db.misDocumentVersion.findUnique({ where: { id: versionId } });
  if (!row || row.docType !== docType || row.refId !== refId) throw new Error('That document version no longer exists.');
  if (row.snapshot == null) return null;
  const snap = parseSnapshot(row.snapshot, docType);
  if (!snap) throw new Error('The stored copy of this version cannot be read. Do not print it.');
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
  // Freeze what the approver saw: a PREPARED version prints live, so re-capture now.
  const snapshot = await captureDocumentSnapshot(row.docType as DocVersionType, row.refId);
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
  const existing = await db.misDocumentVersion.findMany({ where: { docType, refId: row.refId }, select: { version: true } });
  const newest = (existing ?? []).reduce((m, v) => Math.max(m, v.version), 0);
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
