import type { Prisma } from '@/generated/prisma/client';
import { DEFAULT_FACTORY_TIMEZONE, factoryDateKey, zonedParts } from '@/lib/mis/factory-time';
import { roundQty } from '@/lib/mis/quantity';
import { getFactoryTimezone } from './business-rules';

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

/**
 * The advisory-lock key of the daily store-transaction sequence (R3-STK B05). `nextTxnSeq` reads "the last
 * number of the day" and the caller writes the next one, so two movements on DIFFERENT items could both read
 * the same last number. Every writer adds this key to its (sorted) key set, before it reads the sequence.
 */
export const STXN_SEQ_KEY = 'stxn-seq';

/**
 * The factory's zone, read BEFORE a transaction opens (the runtime pool is one connection wide, so a read on
 * `db` from inside a `$transaction` would wait for the connection the transaction holds). Not `async` on
 * purpose: it is an internal helper that returns no data. An unreadable rule falls back to the seeded default,
 * exactly as `getFactoryTimezone` does for an invalid value.
 */
export function storeFactoryZone(): Promise<string> {
  return getFactoryTimezone().catch(() => DEFAULT_FACTORY_TIMEZONE);
}

/**
 * Daily store-transaction sequence, read inside the caller's transaction. The day is the factory's day
 * (`zone` from `storeFactoryZone`), not the server's UTC day. The caller holds `STXN_SEQ_KEY`.
 */
export async function nextTxnSeq(tx: Prisma.TransactionClient, zone: string = DEFAULT_FACTORY_TIMEZONE): Promise<{ prefix: string; next: number }> {
  const ymd = factoryDateKey(new Date(), zone).replace(/-/g, '');
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

/** A count: finite and >= 0, rounded to the stored 2 dp BEFORE it is checked (R3-STK B13). */
export function nonNegativeQty(value: unknown, message = 'Enter a valid quantity (zero or more).'): number {
  const n = roundQty(Number(value));
  if (!Number.isFinite(n) || n < 0) throw new Error(message);
  return n;
}

/** The instant the factory day `dateKey` (`YYYY-MM-DD`) begins in `zone`: factory midnight, not the server's. */
export function factoryDayStart(dateKey: string, zone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const p = zonedParts(new Date(utcMidnight), zone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(utcMidnight - (asIfUtc - utcMidnight));
}
