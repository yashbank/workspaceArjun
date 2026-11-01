import { roundQty } from '@/lib/mis/quantity';
import { itemLockKey } from '@/lib/mis/stock-lock-keys';
import { pageQuery, parseSearch, type Paged } from '@/lib/mis/pagination';
import { db } from '@/server/db';
import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { keyedWrite } from './keyed-once';
import { lockStockKeys } from './stock-lock';
import { lastLedgerBalance, lastTxnBalance, nextTxnSeq, storeFactoryZone, STXN_SEQ_KEY, txnNumberOf } from './store-books';

export async function getInventoryBalance(itemId: string) {
  await requirePermission('inventory.read');
  const last = await db.misInventoryLedger.findFirst({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    select: { balanceQty: true, createdAt: true },
  });
  return { itemId, balance: last?.balanceQty.toNumber() ?? 0, lastUpdated: last?.createdAt ?? null };
}

export async function listInventoryLedger(itemId: string) {
  await requirePermission('inventory.read');
  return db.misInventoryLedger.findMany({
    where: { itemId },
    include: { item: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getInventorySummary() {
  await requirePermission('inventory.read');
  const items = await db.misItem.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  // The latest ledger row of every item in ONE query. One query per item (176 of them) queued on the single-connection
  // runtime pool and the page died with "timeout exceeded when trying to connect" (F-24).
  const latest = await db.$queryRaw<{ item_id: string; balance_qty: unknown; created_at: Date }[]>`
    SELECT DISTINCT ON (item_id) item_id, balance_qty, created_at
    FROM mis_inventory_ledger
    ORDER BY item_id, created_at DESC`;
  const byItem = new Map(latest.map((r) => [r.item_id, r]));
  return items.map((item) => {
    const last = byItem.get(item.id);
    return {
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      balance: last ? Number(last.balance_qty) : 0,
      lastUpdated: last?.created_at ?? null,
    };
  });
}

/**
 * R2-83: one page of the stock list (25 items by name). `q` matches code or name. Only the page's items have their
 * latest ledger row read; `outOfStock` counts every active item at or below zero, so the header stays whole-list.
 */
export async function getInventoryPage(
  opts: { q?: string; page?: number | string } = {},
): Promise<Paged<Awaited<ReturnType<typeof getInventorySummary>>[number]> & { outOfStock: number }> {
  await requirePermission('inventory.read');
  const q = parseSearch(opts.q);
  const where = {
    deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { code: { contains: q, mode: 'insensitive' as const } }] } : {}),
  };
  const { skip, take } = pageQuery(opts.page);
  const [items, total, zero] = await Promise.all([
    db.misItem.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
    db.misItem.count({ where }),
    db.$queryRaw<{ n: bigint | number }[]>`
      SELECT count(*) AS n FROM mis_items i
      LEFT JOIN LATERAL (SELECT balance_qty FROM mis_inventory_ledger l WHERE l.item_id = i.id ORDER BY l.created_at DESC LIMIT 1) last ON true
      WHERE i.deleted_at IS NULL AND COALESCE(last.balance_qty, 0) <= 0`,
  ]);
  const ids = items.map((i) => i.id);
  const latest = ids.length
    ? await db.$queryRaw<{ item_id: string; balance_qty: unknown; created_at: Date }[]>`
        SELECT DISTINCT ON (item_id) item_id, balance_qty, created_at
        FROM mis_inventory_ledger
        WHERE item_id = ANY(${ids})
        ORDER BY item_id, created_at DESC`
    : [];
  const byItem = new Map(latest.map((r) => [r.item_id, r]));
  const rows = items.map((item) => {
    const last = byItem.get(item.id);
    return {
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      balance: last ? Number(last.balance_qty) : 0,
      lastUpdated: last?.created_at ?? null,
    };
  });
  return { rows, total, outOfStock: Number(zero[0]?.n ?? 0) };
}

/** `idempotencyKey` (R2-292): optional; the same key twice writes one adjustment. */
export async function adjustInventory(itemId: string, changeQty: number, notes?: string, idempotencyKey?: string | null) {
  const actor = await requirePermission('inventory.write');
  // B07 — a hand adjustment to stock always says why.
  const why = notes?.trim() ?? '';
  if (why.length < 3) throw new Error('Give a reason (at least 3 characters).');
  const change = roundQty(Number(changeQty));
  if (!Number.isFinite(change) || change === 0) throw new Error('Enter an adjustment other than zero.');
  const zone = await storeFactoryZone(); // read before the transaction: the runtime pool is one connection wide

  // D2: stock never goes negative. The balance reads, the check and the writes are one read-modify-write, so they run
  // under the item lock like every other writer of these books. Both books move together (as a count reconcile does):
  // an adjustment only the ledger heard of would be refused later against a storekeeper's book that never saw it.
  const keyed = await keyedWrite('STOCK_ADJUST', idempotencyKey, actor.userId, { itemId, change, why }, async (tx) => {
    await lockStockKeys(tx, [itemLockKey(itemId), STXN_SEQ_KEY]);
    const current = await lastLedgerBalance(tx, itemId);
    const txnBalance = await lastTxnBalance(tx, itemId);
    // The smaller book is the stock: a removal is checked against it.
    if (change < 0 && -change > Math.min(current, txnBalance)) throw new Error('Adjustment would result in negative balance');
    const newBalance = roundQty(current + change);
    const row = await tx.misInventoryLedger.create({
      data: {
        itemId,
        changeQty: change,
        balanceQty: newBalance,
        source: 'MANUAL_ADJUSTMENT',
        notes: why,
      },
    });
    const { prefix, next } = await nextTxnSeq(tx, zone);
    const txn = await tx.misStoreTransaction.create({
      data: {
        txnNumber: txnNumberOf(prefix, next),
        itemId,
        type: change > 0 ? 'IN' : 'OUT',
        quantity: Math.abs(change),
        balanceQty: roundQty(txnBalance + change),
        referenceNo: 'Inventory adjustment',
        reason: why,
        isOverIssue: false,
        createdById: actor.userId,
      },
    });
    return { row, current, newBalance, txnNumber: txn?.txnNumber ?? null };
  });
  const { row, current, newBalance, txnNumber } = keyed.value;
  if (keyed.replay) return newBalance; // R2-292: the first call already wrote and audited it
  // V2 Epic 6: a hand adjustment to stock was the one ledger write with no audit row.
  await logAuditEvent({
    actorId: actor.userId,
    action: 'inventory.adjust',
    entity: 'MisInventoryLedger',
    entityId: row.id,
    before: { itemId, balanceQty: String(current) },
    after: { itemId, balanceQty: String(newBalance), changeQty: String(change), notes: why, txnNumber },
  });
  return newBalance;
}
