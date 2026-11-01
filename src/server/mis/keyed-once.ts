import type { Prisma } from '@/generated/prisma/client';
import type { QueuedWriteKind } from '@/lib/mis/offline/idempotency';
import { db } from '@/server/db';
import { runIdempotent } from './idempotency';

/** R2-291/292: the keyed kinds. Moved here from store.ts so grn.ts and inventory.ts share the one helper. */
export type KeyedKind = 'STORE_RECEIPT' | 'STORE_ISSUE' | 'GRN_CONFIRM' | 'STOCK_ADJUST' | 'STORE_IN' | 'STORE_OUT';

/**
 * R3-STK B11 — run a cart commit exactly once per key, on the shared idempotency table (`runIdempotent`, unedited).
 * The key row and the stock rows commit together or not at all, so a second press of Confirm (or a retry after a
 * dropped connection) returns the FIRST result and writes nothing. `live`: the person is at the screen, so a refusal
 * is handed back as the sentence they read and nothing is recorded or parked.
 *
 * The idempotency vocabulary (`QueuedWriteKind`) is the offline queue's closed list; the column itself is free text,
 * and a store kind needs no timing or inbox rule, so the kind is passed through as-is rather than editing that list.
 */
export async function runOnce<T extends object>(
  kind: KeyedKind,
  key: string,
  actorId: string,
  payload: object,
  entityType: string,
  apply: (tx: Prisma.TransactionClient) => Promise<{ entityId: string | null; result: T }>,
): Promise<{ value: T; replay: boolean }> {
  const out = await runIdempotent<T>(
    { key, kind: kind as unknown as QueuedWriteKind, payload, clientRecordedAt: new Date().toISOString(), actorId },
    async (tx) => {
      const done = await apply(tx);
      return { entityType, entityId: done.entityId as string, result: done.result };
    },
    { live: true },
  );
  if (out.outcome === 'APPLIED' && out.result) return { value: out.result, replay: false };
  if (out.outcome === 'DUPLICATE' && out.result) return { value: out.result, replay: true };
  throw new Error(out.detail || 'That did not save. Try again.');
}


/**
 * R2-292: run a single-row store write once per key when a key is given, else as a plain transaction.
 * `replay` is true when the key was already used: the caller returns the first result and audits nothing.
 */
export async function keyedWrite<T extends object>(
  kind: KeyedKind,
  key: string | null | undefined,
  actorId: string,
  payload: object,
  apply: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ value: T; replay: boolean }> {
  if (!key) return { value: await db.$transaction((tx) => apply(tx)), replay: false };
  return runOnce<T>(kind, key, actorId, payload, 'MisStoreTransaction', async (tx) => ({ entityId: null, result: await apply(tx) }));
}
