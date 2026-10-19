import {
  approvalRefusal,
  isDocVersionType,
  nextVersionNumber,
  type DocVersionStatus,
  type DocVersionType,
} from '@/lib/mis/document-version';
import { can, type MisAction } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';

/**
 * R2-46 — versioned COA and job-card issues with a two-level sign-off (MisDocumentVersion).
 *
 * `refId` is the order id for both types (D9: the order IS the job card; a COA certifies an order).
 *
 *  - read:    `orders.read` — anyone who can open the print page sees its version and status.
 *  - prepare: `qc.write` for a COA, `production.write` for a job card — the person issuing it.
 *  - approve: `approvals.read` (Admin and Owner only), and never the person who prepared it.
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
    canApprove:
      can(actor.role, 'approvals.read') &&
      approvalRefusal({ role: actor.role, actorId: actor.userId, preparedById: r.preparedById, status: r.status as DocVersionStatus }) === null,
  }));
  return { docType, refId, versions, latest: versions[0] ?? null, canPrepare: can(actor.role, PREPARE_ACTION[docType]) };
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
  const existing = await db.misDocumentVersion.findMany({ where: { docType, refId }, select: { version: true } });
  const version = nextVersionNumber(existing ?? []);
  const rec = await db.misDocumentVersion.create({
    data: { docType, refId, version, status: 'PREPARED', preparedById: actor.userId, notes: notes?.trim() || null },
  });
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
  const now = new Date();
  // Conditional on PREPARED so two approvers racing cannot both stamp it.
  const updated = await db.misDocumentVersion.updateMany({
    where: { id: versionId, status: 'PREPARED' },
    data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: now },
  });
  if (!updated || updated.count === 0) throw new Error('This version is already approved.');
  await logAuditEvent({
    actorId: actor.userId,
    action: 'DOC_VERSION_APPROVE',
    entity: 'MisDocumentVersion',
    entityId: versionId,
    before: { status: 'PREPARED' },
    after: { docType: row.docType, refId: row.refId, version: row.version, status: 'APPROVED' },
  });
  return { ...row, status: 'APPROVED' as const, approvedById: actor.userId, approvedAt: now };
}
