import type { Prisma } from '@/generated/prisma/client';

/**
 * Serialise concurrent writers of one stock chain.
 *
 * A balance is read, a quantity is checked against it, and a new row is written from it. Under
 * READ COMMITTED two transactions can both read the same "previous balance" and both pass the
 * check, so stock is over-issued or a GRN is credited twice. A transaction-scoped advisory lock on
 * the key makes the second transaction wait until the first commits, and then it reads the
 * committed balance.
 *
 * `pg_advisory_xact_lock` is released by COMMIT/ROLLBACK, so it is safe behind the Supabase
 * transaction pooler. A session-level lock (`pg_advisory_lock`) is NOT: the connection returns to
 * the pool and the lock leaks. Never use one.
 *
 * Keys are taken in sorted order so two carts that share items cannot deadlock. The call is a
 * `$queryRaw` of a SELECT (a void-returning function cannot be deserialised, so the result is
 * wrapped in `SELECT 1`).
 */
export async function lockStockKeys(tx: Prisma.TransactionClient, keys: readonly string[]): Promise<void> {
  // A test double without raw SQL has no concurrent writers to serialise; a real client always has it.
  if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== 'function') return;
  for (const key of [...new Set(keys)].sort()) {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}::text))) AS l`;
  }
}
