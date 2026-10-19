/**
 * R2-46 — controlled document versions (COA, job card) as pure rules. No Prisma, no React.
 *
 * Each issue of a document is a numbered version (V1, V2, …) with a two-level sign-off: someone
 * PREPARES it, a different person (Admin or Owner) APPROVES it. A reprint shows the version and its
 * status; the file name follows Type_OrderNo_DDMMYY_Vn.
 */
import { zonedParts } from './factory-time';

export const DOC_VERSION_TYPES = ['COA', 'JOB_CARD'] as const;
export type DocVersionType = (typeof DOC_VERSION_TYPES)[number];
export type DocVersionStatus = 'PREPARED' | 'APPROVED';

export function isDocVersionType(v: unknown): v is DocVersionType {
  return typeof v === 'string' && (DOC_VERSION_TYPES as readonly string[]).includes(v);
}

/** The next version number: one more than the highest so far, starting at 1. */
export function nextVersionNumber(existing: readonly { version: number }[]): number {
  return existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

const FILE_PREFIX: Record<DocVersionType, string> = { COA: 'COA', JOB_CARD: 'JobCard' };

/** `COA_ORD-101_191026_V2` — the owner's naming convention (DDMMYY on the factory clock). */
export function docFileName(type: DocVersionType, orderNumber: string, at: Date, version: number | null, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  const ddmmyy = `${String(p.day).padStart(2, '0')}${String(p.month).padStart(2, '0')}${String(p.year % 100).padStart(2, '0')}`;
  const safeOrder = orderNumber.replace(/[^A-Za-z0-9-]+/g, '-');
  return `${FILE_PREFIX[type]}_${safeOrder}_${ddmmyy}_${version ? `V${version}` : 'DRAFT'}`;
}

/**
 * Second level of the sign-off: an Admin or the Owner, never the person who prepared it, and only
 * a version still PREPARED. Returns the refusal sentence, or null when allowed.
 */
export function approvalRefusal(i: {
  role: string | null | undefined;
  actorId: string;
  preparedById: string | null;
  status: DocVersionStatus;
}): string | null {
  if (i.role !== 'ADMIN' && i.role !== 'OWNER') return 'Only an Admin or the Owner can approve a document.';
  if (i.status === 'APPROVED') return 'This version is already approved.';
  if (i.preparedById && i.preparedById === i.actorId) return 'A second person must approve: you prepared this version.';
  return null;
}

/** "V2 · Approved" / "V1 · Prepared — awaiting approval" / "Not issued — uncontrolled copy". */
export function versionLabel(v: { version: number; status: DocVersionStatus } | null): string {
  if (!v) return 'Not issued — uncontrolled copy';
  return v.status === 'APPROVED' ? `V${v.version} · Approved` : `V${v.version} · Prepared — awaiting approval`;
}
