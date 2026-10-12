import type { Prisma } from '@/generated/prisma/client';
import { roundQty } from '@/lib/mis/quantity';

/**
 * The two stock books and the small helpers every writer of them shares.
 *
 *   - the inventory ledger (`mis_inventory_ledger`): the authoritative running balance;
 *   - the storekeeper's IN/OUT book (`mis_store_transactions`): its own running balance.
 *
 * All callers hold the item's advisory lock (`lockStockKeys`) before reading a balance here.
 * Lives in its own file so `grn.ts` can use it without importing `store.ts` (which imports `grn.ts`).
 */

/** Money and weights are 2dp in the schema; keep float drift out of the ledger. */
export function round2(value: number): number {
  return roundQty(value);
}

/** Daily store-transaction sequence, read inside the caller's transaction. */
export async function nextTxnSeq(tx: Prisma.TransactionClient): Promise<{ prefix: string; next: number }> {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `STXN-${ymd}-`;
  const last = await tx.misStoreTransaction.findFirst({
    where: { txnNumber: { startsWith: prefix } },
    orderBy: { txnNumber: 'desc' },
    select: { txnNumber: true },
  });
  return { prefix, next: last ? parseInt(last.txnNumber.slice(prefix.length), 10) + 1 : 1 };
}

export async function lastLedgerBalance(tx: Prisma.TransactionClient, itemId: string): Promise<number> {
  const last = await tx.misInventoryLedger.findFirst({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    select: { balanceQty: true },
  });
  return last ? last.balanceQty.toNumber() : 0;
}

export async function lastTxnBalance(tx: Prisma.TransactionClient, itemId: string): Promise<number> {
  const last = await tx.misStoreTransaction.findFirst({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    select: { balanceQty: true },
  });
  return last ? last.balanceQty.toNumber() : 0;
}

export function txnNumberOf(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(4, '0')}`;
}
