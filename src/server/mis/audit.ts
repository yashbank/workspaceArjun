import type { Prisma } from '@/generated/prisma/client';
import { redactForStorage } from '@/lib/mis/audit-redaction';
import { db } from '@/server/db';

type Diff = Record<string, unknown> | null | undefined;

/**
 * Legacy top-level-only masking, kept because wage-leak.test.ts pins its shallow behaviour (its F-05
 * nested case is still `it.fails`). `logAuditEvent` does NOT use it: it stores through
 * `redactForStorage`, which masks at any depth. See `lib/mis/audit-redaction.ts` for the write/read split.
 */
export function redact(input: Diff): Record<string, unknown> | null {
  if (!input) return null;
  const masked = redactForStorage(input) ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) out[k] = masked[k] === '[redacted]' ? '[redacted]' : v;
  return out;
}

const forStorage = redactForStorage;

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Diff;
  after?: Diff;
  ip?: string | null;
  /** There is no severity column (no schema change): a WARNING is carried in `after.severity`. */
  severity?: 'INFO' | 'WARNING';
  /** R2-17/34: why a record was corrected or voided. No column either: carried in `after.reason`. */
  reason?: string;
};

/** Spec Epic 1: a GRN with a discrepancy gets a WARNING entry. grn.ts calls this after the GRN is saved. */
export function logGrnDiscrepancy(args: { actorId: string | null; grnId: string; discrepancies: Record<string, unknown>; ip?: string | null }): Promise<void> {
  return logAuditEvent({
    actorId: args.actorId,
    action: 'grn.discrepancy',
    entity: 'grn',
    entityId: args.grnId,
    after: { discrepancies: args.discrepancies },
    severity: 'WARNING',
    ip: args.ip,
  });
}

/** `after` plus the severity and reason that have no column of their own. */
function withExtras(entry: AuditEntry): Diff {
  if (!entry.severity && !entry.reason) return entry.after;
  return {
    ...(entry.after ?? {}),
    ...(entry.severity ? { severity: entry.severity } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
  };
}

/**
 * Write an audit row.
 *
 * Deliberately never throws. An audit table that can fail a user's save turns a
 * logging problem into an outage — so a failed write is reported to the server
 * log and the caller carries on. It is not swallowed silently.
 */
export async function logAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    await db.misAuditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        // Prisma types a JSON column as InputJsonValue, which a plain
        // Record<string, unknown> does not satisfy structurally. The value is
        // JSON by construction — redact() only ever returns primitives and
        // values that came out of a JSON-shaped diff.
        before: (forStorage(entry.before) ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (forStorage(withExtras(entry)) ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[mis-audit] failed to write audit row', {
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      error,
    });
  }
}
