import type { Prisma } from '@/generated/prisma/client';
import { MONEY_FIELDS } from '@/lib/mis/money-fields';
import { db } from '@/server/db';

/**
 * Fields that must never reach the audit table for an entity a non-owner can
 * read back (S9). Wages are the factory's most sensitive number; an audit diff
 * is the easiest place to leak one by accident.
 */
const REDACTED_KEYS = new Set<string>([
  // Material prices (D24, F-06): a BOM/PO line's rate and a stock item's price. The audit page is
  // readable by Admin (`settings.read`), so a price written here is a price sent to them.
  ...MONEY_FIELDS,
  'wage',
  'wageAmount',
  'dailyWage',
  'rate',
  'salary',
  'amount',
  'netPay',
]);

type Diff = Record<string, unknown> | null | undefined;

/** Replace sensitive values with a marker, keeping the shape of the diff. */
export function redact(input: Diff): Record<string, unknown> | null {
  if (!input) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = REDACTED_KEYS.has(key) ? '[redacted]' : value;
  }
  return out;
}

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Diff;
  after?: Diff;
  ip?: string | null;
};

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
        before: (redact(entry.before) ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (redact(entry.after) ?? undefined) as Prisma.InputJsonValue | undefined,
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
