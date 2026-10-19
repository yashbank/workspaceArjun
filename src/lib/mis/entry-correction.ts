/**
 * Who may correct (edit) or void (delete) a production log or a QC check, and until when
 * (R2-17 / R2-34, docs/qa/R2_DECISIONS.md). Pure: no Prisma, no React. The server functions
 * (`editProductionLog`, `voidProductionLog`, `editQcCheck`, `voidQcCheck`) enforce it; the pages use
 * the same answer only to decide whether to draw the Edit / Delete buttons.
 *
 *  - ADMIN / OWNER: edit or delete any entry within 7 days of it.
 *  - QC inspector: their OWN QC checks, on the same factory day only.
 *  - SUPERVISOR: production entries may still be edited within 24 h (R3 B126); never deleted.
 *  - Everyone else: no.
 *
 * Every correction carries a reason of at least 3 characters, which goes to the audit row.
 */
import { factoryDateKey } from './factory-time';
import type { MisRoleName } from './roles';

export const CORRECTION_ADMIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** R3 B126 — kept for the supervisor's quick fix of a production entry. */
export const CORRECTION_SUPERVISOR_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CORRECTION_REASON_MIN = 3;

export type CorrectionKind = 'PRODUCTION' | 'QC';
export type CorrectionAction = 'EDIT' | 'DELETE';

export type CorrectionInput = {
  kind: CorrectionKind;
  action: CorrectionAction;
  role: MisRoleName | null | undefined;
  actorId: string;
  /** Who recorded the entry (loggedById / checkById); null when unknown. */
  ownerId: string | null | undefined;
  /** When the entry happened (loggedAt / createdAt). */
  at: Date;
  now: Date;
  timeZone: string;
};

export type CorrectionVerdict = { allowed: true } | { allowed: false; reason: string };

const ADMINS: readonly string[] = ['ADMIN', 'OWNER'];

export function correctionVerdict(i: CorrectionInput): CorrectionVerdict {
  const age = i.now.getTime() - i.at.getTime();
  if (i.role && ADMINS.includes(i.role)) {
    return age <= CORRECTION_ADMIN_WINDOW_MS
      ? { allowed: true }
      : { allowed: false, reason: 'Entries older than 7 days cannot be changed.' };
  }
  if (i.kind === 'QC' && i.role === 'QC') {
    if (!i.ownerId || i.ownerId !== i.actorId) {
      return { allowed: false, reason: 'You can only change QC checks you recorded yourself.' };
    }
    return factoryDateKey(i.at, i.timeZone) === factoryDateKey(i.now, i.timeZone)
      ? { allowed: true }
      : { allowed: false, reason: 'A QC inspector can change a check only on the day it was recorded.' };
  }
  if (i.kind === 'PRODUCTION' && i.role === 'SUPERVISOR' && i.action === 'EDIT') {
    return age <= CORRECTION_SUPERVISOR_WINDOW_MS
      ? { allowed: true }
      : { allowed: false, reason: 'A supervisor can edit an entry for 24 h; after that ask an Admin.' };
  }
  return { allowed: false, reason: 'Only an Admin or the Owner can change this entry.' };
}

/** The reason every correction must carry, trimmed; throws when it is too short. */
export function requireCorrectionReason(reason: string | null | undefined): string {
  const r = (reason ?? '').trim();
  if (r.length < CORRECTION_REASON_MIN) throw new Error('Give a reason for the change (at least 3 characters).');
  return r;
}
