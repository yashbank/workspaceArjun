import type { Prisma } from '@/generated/prisma/client';
import { MisItemCategory } from '@/generated/prisma/enums';
import { db } from '@/server/db';
import { can } from '@/lib/mis/permissions';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';
import { assertPoReceivable, auditOverReceipt, enforceReceiptCap, isGrnNumberClash, GRN_NUMBER_ATTEMPTS, nextGrnNumber } from './grn';
import { runIdempotent } from './idempotency';
import { allocateFromReceipt, allocationShortfalls } from './order-allocation';
import { notifyGrnConfirmed } from './grn-alerts';
import { addDaysToDateKey, factoryDateKey } from '@/lib/mis/factory-time';
import type { QueuedWriteKind } from '@/lib/mis/offline/idempotency';
import { poPurpose, type PoPurpose } from '@/lib/mis/po-purpose';
import { categoryRefusal } from '@/lib/mis/material-request';
import { OrderStockQuotaExceededError } from '@/lib/mis/order-allocation';
import { isOrderClosed } from '@/lib/mis/order-status';
import { positiveQty, roundQty } from '@/lib/mis/quantity';
import { poStatusAfterReceipt, receiptVerdict } from '@/lib/mis/receipt-rules';
import { isLowStock } from '@/lib/mis/stock-predicates';
import { itemLockKey, poItemLockKey } from '@/lib/mis/stock-lock-keys';
import { lockStockKeys } from './stock-lock';
import { formatMoney } from './po';
import {
  factoryDayStart,
  lastLedgerBalance,
  lastTxnBalance,
  nextTxnSeq,
  nonNegativeQty,
  round2,
  storeFactoryZone,
  STXN_SEQ_KEY,
  txnNumberOf,
} from './store-books';

// ---------------------------------------------------------------------------
// Types (runtime only — no generated Prisma types imported)
// ---------------------------------------------------------------------------

export type StoreItemRow = {
  id: string;
  code: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number | null;
  // stock balance from latest store transaction
  stockBalance: number;
  // price — only populated for OWNER role
  pricePerUnit?: number | null;
  isDemo: boolean;
  isActive: boolean;
};

export type StoreTxnRow = {
  id: string;
  txnNumber: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  sku: string | null;
  type: 'IN' | 'OUT';
  quantity: number;
  balanceQty: number;
  referenceNo: string | null;
  reason: string | null;
  isOverIssue: boolean;
  createdAt: Date;
};

export type PhysicalCountRow = {
  id: string;
  itemId: string;
  itemName: string;
  countDate: string;
  physicalQty: number;
  systemQty: number;
  discrepancy: number;
  notes: string | null;
  /** D3: true once the variance has been written to both books (an adjustment row names this count). */
  reconciled: boolean;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Running balance for an item from the store transactions ledger. */
async function getStockBalance(itemId: string): Promise<number> {
  const last = await db.misStoreTransaction.findFirst({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    select: { balanceQty: true },
  });
  return last ? Number(last.balanceQty) : 0;
}

/**
 * The running balance of EVERY item, in one query (latest transaction per item).
 *
 * A page that shows the whole store used to call `getStockBalance` once per item — 176 queries — and the runtime
 * connection pool is deliberately one connection wide (`createPoolConfig`, `max: 1`), so the queries queued behind
 * each other for over ten seconds and the page died with "timeout exceeded when trying to connect" (F-24).
 * Items with no transaction are simply absent from the map: their balance is 0.
 */
async function getStockBalances(): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ item_id: string; balance_qty: unknown }[]>`
    SELECT DISTINCT ON (item_id) item_id, balance_qty
    FROM mis_store_transactions
    ORDER BY item_id, created_at DESC`;
  return new Map(rows.map((r) => [r.item_id, Number(r.balance_qty)]));
}

// ---------------------------------------------------------------------------
// MIS-281: List items
// ---------------------------------------------------------------------------

/**
 * List all active store items with their current stock balance.
 * Price is included only for OWNER role.
 */
export async function listStoreItems(): Promise<StoreItemRow[]> {
  const actor = await requirePermission('store.read');

  const items = await db.misItem.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ category: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      sku: true,
      name: true,
      category: true,
      unit: true,
      reorderLevel: true,
      pricePerUnit: true,
      isDemo: true,
      isActive: true,
    },
  });

  const balances = await getStockBalances();
  const rows: StoreItemRow[] = await Promise.all(
    items.map(async (item) => {
      const balance = balances.get(item.id) ?? 0;
      const row: StoreItemRow = {
        id: item.id,
        code: item.code,
        sku: item.sku,
        name: item.name,
        category: item.category,
        unit: item.unit,
        reorderLevel: item.reorderLevel != null ? Number(item.reorderLevel) : null,
        stockBalance: balance,
        isDemo: item.isDemo,
        isActive: item.isActive,
      };
      // Price only for OWNER
      if (actor.role === 'OWNER') {
        row.pricePerUnit = item.pricePerUnit ? Number(item.pricePerUnit) : null;
      }
      return row;
    }),
  );

  return rows;
}

// ---------------------------------------------------------------------------
// MIS-282: Store IN
// ---------------------------------------------------------------------------

export type StoreInInput = {
  itemId: string;
  quantity: number;
  referenceNo?: string;
  notes?: string;
};

export async function createStoreIn(input: StoreInInput): Promise<StoreTxnRow> {
  const actor = await requirePermission('store.write');

  const quantity = positiveQty(input.quantity, 'Quantity must be positive');

  const item = await db.misItem.findFirst({
    where: { id: input.itemId, isActive: true, deletedAt: null },
    select: { id: true, name: true, code: true, sku: true },
  });
  if (!item) throw new Error('Item not found or inactive');

  const zone = await storeFactoryZone();
  // Both books, one transaction, under the item lock: the Inventory ledger and the storekeeper's
  // book must agree, or a later OUT is refused against a ledger that never heard of this stock.
  const txn = await db.$transaction(async (tx) => {
    await lockStockKeys(tx, [itemLockKey(input.itemId), STXN_SEQ_KEY]);
    const ledgerBalance = await lastLedgerBalance(tx, input.itemId);
    await tx.misInventoryLedger.create({
      data: {
        itemId: input.itemId,
        changeQty: quantity,
        balanceQty: round2(ledgerBalance + quantity),
        source: 'STORE_IN',
        sourceId: null,
        notes: input.referenceNo ?? input.notes ?? 'Store IN',
      },
    });
    const txnBalance = await lastTxnBalance(tx, input.itemId);
    const { prefix, next } = await nextTxnSeq(tx, zone);
    return tx.misStoreTransaction.create({
      data: {
        txnNumber: txnNumberOf(prefix, next),
        itemId: input.itemId,
        type: 'IN',
        quantity,
        balanceQty: round2(txnBalance + quantity),
        referenceNo: input.referenceNo ?? null,
        reason: input.notes ?? null,
        isOverIssue: false,
        createdById: actor.userId,
      },
    });
  });
  const txnNumber = txn.txnNumber;
  const newBalance = Number(txn.balanceQty);

  await logAuditEvent({
    action: 'store.in',
    entity: 'MisStoreTransaction',
    entityId: txn.id,
    actorId: actor.userId,
    after: { itemId: input.itemId, quantity, txnNumber, newBalance: String(newBalance) },
  });

  return {
    id: txn.id,
    txnNumber: txn.txnNumber,
    itemId: txn.itemId,
    itemName: item.name,
    itemCode: item.code,
    sku: item.sku,
    type: 'IN',
    quantity: Number(txn.quantity),
    balanceQty: Number(txn.balanceQty),
    referenceNo: txn.referenceNo,
    reason: txn.reason,
    isOverIssue: false,
    createdAt: txn.createdAt,
  };
}

// ---------------------------------------------------------------------------
// MIS-283: Store OUT
// ---------------------------------------------------------------------------

export type StoreOutInput = {
  itemId: string;
  quantity: number;
  referenceNo?: string;
};

export async function createStoreOut(input: StoreOutInput): Promise<StoreTxnRow> {
  const actor = await requirePermission('store.write');

  const quantity = positiveQty(input.quantity, 'Quantity must be positive');

  const item = await db.misItem.findFirst({
    where: { id: input.itemId, isActive: true, deletedAt: null },
    select: { id: true, name: true, code: true, sku: true },
  });
  if (!item) throw new Error('Item not found or inactive');

  const zone = await storeFactoryZone();
  // D2: stock never goes negative, so there is no over-issue. Both books are written under the item
  // lock (as commitIssue does) so Inventory, Store stock and Traceability agree after every issue.
  const txn = await db.$transaction(async (tx) => {
    await lockStockKeys(tx, [itemLockKey(input.itemId), STXN_SEQ_KEY]);
    const ledgerBalance = await lastLedgerBalance(tx, input.itemId);
    const txnBalance = await lastTxnBalance(tx, input.itemId);
    const available = Math.min(ledgerBalance, txnBalance);
    if (quantity > available) {
      throw new Error(`Cannot issue more than the stock balance (${round2(Math.max(0, available))} available)`);
    }
    const reference = input.referenceNo ?? `Issue ${factoryDateKey(new Date(), zone)}`;
    await tx.misInventoryLedger.create({
      data: {
        itemId: input.itemId,
        changeQty: -quantity,
        balanceQty: round2(ledgerBalance - quantity),
        source: 'STORE_ISSUE',
        sourceId: null,
        notes: reference,
      },
    });
    const { prefix, next } = await nextTxnSeq(tx, zone);
    return tx.misStoreTransaction.create({
      data: {
        txnNumber: txnNumberOf(prefix, next),
        itemId: input.itemId,
        type: 'OUT',
        quantity,
        balanceQty: round2(txnBalance - quantity),
        referenceNo: input.referenceNo ?? null,
        reason: null,
        isOverIssue: false,
        createdById: actor.userId,
      },
    });
  });

  await logAuditEvent({
    action: 'store.out',
    entity: 'MisStoreTransaction',
    entityId: txn.id,
    actorId: actor.userId,
    after: { itemId: input.itemId, quantity, txnNumber: txn.txnNumber, newBalance: String(Number(txn.balanceQty)), isOverIssue: false },
  });

  return {
    id: txn.id,
    txnNumber: txn.txnNumber,
    itemId: txn.itemId,
    itemName: item.name,
    itemCode: item.code,
    sku: item.sku,
    type: 'OUT',
    quantity: Number(txn.quantity),
    balanceQty: Number(txn.balanceQty),
    referenceNo: txn.referenceNo,
    reason: txn.reason,
    isOverIssue: false,
    createdAt: txn.createdAt,
  };
}

// ---------------------------------------------------------------------------
// MIS-287: Transaction ledger for an item
// ---------------------------------------------------------------------------

export async function listStoreTxns(itemId: string): Promise<StoreTxnRow[]> {
  await requirePermission('store.read');

  const item = await db.misItem.findFirst({
    where: { id: itemId },
    select: { id: true, name: true, code: true, sku: true },
  });
  if (!item) return [];

  const txns = await db.misStoreTransaction.findMany({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return txns.map((t) => ({
    id: t.id,
    txnNumber: t.txnNumber,
    itemId: t.itemId,
    itemName: item.name,
    itemCode: item.code,
    sku: item.sku,
    type: t.type,
    quantity: Number(t.quantity),
    balanceQty: Number(t.balanceQty),
    referenceNo: t.referenceNo,
    reason: t.reason,
    isOverIssue: t.isOverIssue,
    createdAt: t.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// MIS-288/289: Stock dashboard — all items with balances
// ---------------------------------------------------------------------------

export type StockSummaryRow = {
  id: string;
  code: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  stockBalance: number;
  reorderLevel: number | null;
  belowReorder: boolean;
  // OWNER only. B16: the value is computed and formatted here; the client only prints it.
  pricePerUnit?: number | null;
  stockValue?: number | null;
  /** `formatMoney(stockValue)`, e.g. "₹4,420.50". */
  stockValueLabel?: string | null;
  isDemo: boolean;
};

export async function listStockSummary(): Promise<StockSummaryRow[]> {
  const actor = await requirePermission('store.read');

  const items = await db.misItem.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ category: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      sku: true,
      name: true,
      category: true,
      unit: true,
      reorderLevel: true,
      pricePerUnit: true,
      isDemo: true,
    },
  });

  const balances = await getStockBalances();
  return Promise.all(
    items.map(async (item) => {
      const balance = balances.get(item.id) ?? 0;
      const reorderLevel = item.reorderLevel != null ? Number(item.reorderLevel) : null;
      const row: StockSummaryRow = {
        id: item.id,
        code: item.code,
        sku: item.sku,
        name: item.name,
        category: item.category,
        unit: item.unit,
        stockBalance: balance,
        reorderLevel,
        belowReorder: isLowStock(balance, reorderLevel),
        isDemo: item.isDemo,
      };
      if (actor.role === 'OWNER') {
        const price = item.pricePerUnit ? Number(item.pricePerUnit) : null;
        row.pricePerUnit = price;
        row.stockValue = price !== null ? round2(price * balance) : null;
        row.stockValueLabel = row.stockValue !== null ? formatMoney(row.stockValue) : null;
      }
      return row;
    }),
  );
}

// ---------------------------------------------------------------------------
// MIS-292: Physical count entry
// ---------------------------------------------------------------------------

/** The ledger `source` of a reconciliation; its `source_id` is the physical count it settled. */
export const COUNT_ADJUSTMENT_SOURCE = 'COUNT_ADJUSTMENT';

export type PhysicalCountInput = {
  itemId: string;
  physicalQty: number;
  countDate: string; // ISO date YYYY-MM-DD
  notes?: string;
};

export async function recordPhysicalCount(input: PhysicalCountInput): Promise<PhysicalCountRow> {
  const actor = await requirePermission('store.count');
  const physicalQty = nonNegativeQty(input.physicalQty, 'Enter the counted quantity (zero or more).');

  const item = await db.misItem.findFirst({
    where: { id: input.itemId, isActive: true, deletedAt: null },
    select: { id: true, name: true, code: true },
  });
  if (!item) throw new Error('Item not found');

  const systemQty = await getStockBalance(input.itemId);
  const discrepancy = round2(physicalQty - systemQty);

  const count = await db.misPhysicalCount.create({
    data: {
      itemId: input.itemId,
      countDate: new Date(input.countDate),
      physicalQty,
      systemQty,
      discrepancy,
      notes: input.notes ?? null,
      countedById: actor.userId,
    },
  });

  await logAuditEvent({
    action: 'store.count',
    entity: 'MisPhysicalCount',
    entityId: count.id,
    actorId: actor.userId,
    after: { itemId: input.itemId, physicalQty: String(physicalQty), systemQty: String(systemQty), discrepancy: String(discrepancy) },
  });

  return {
    id: count.id,
    itemId: count.itemId,
    itemName: item.name,
    countDate: input.countDate,
    physicalQty: Number(count.physicalQty),
    systemQty: Number(count.systemQty),
    discrepancy: Number(count.discrepancy),
    notes: count.notes,
    reconciled: false,
    createdAt: count.createdAt,
  };
}

/** List physical counts — most recent first. Owner/Admin only (discrepancy is sensitive). */
export async function listPhysicalCounts(itemId?: string): Promise<PhysicalCountRow[]> {
  await requirePermission('store.count');

  const where = itemId ? { itemId } : {};
  const counts = await db.misPhysicalCount.findMany({
    where,
    include: { item: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // "Reconciled" needs no column: a count adjustment row in the ledger names the count it settled.
  const adjustments = counts.length
    ? await db.misInventoryLedger.findMany({
        where: { source: COUNT_ADJUSTMENT_SOURCE, sourceId: { in: counts.map((c) => c.id) } },
        select: { sourceId: true },
      })
    : [];
  const reconciledIds = new Set(adjustments.map((a) => a.sourceId));

  return counts.map((c) => ({
    id: c.id,
    itemId: c.itemId,
    itemName: c.item?.name ?? '',
    countDate: c.countDate.toISOString().slice(0, 10),
    physicalQty: Number(c.physicalQty),
    systemQty: Number(c.systemQty),
    discrepancy: Number(c.discrepancy),
    notes: c.notes,
    reconciled: reconciledIds.has(c.id),
    createdAt: c.createdAt,
  }));
}

/**
 * D3 — settle a physical count's variance in BOTH books, on the storekeeper's say-so (a reason is required).
 * Recording a count never moves stock; this is the one deliberate step that does. Once per count.
 */
export async function reconcilePhysicalCount(countId: string, reason: string): Promise<{ adjustment: number }> {
  const actor = await requirePermission('store.write');
  const why = reason?.trim() ?? '';
  if (why.length < 3) throw new Error('Give a reason (at least 3 characters) to reconcile a count.');

  const count = await db.misPhysicalCount.findUnique({ where: { id: countId } });
  if (!count) throw new Error('Physical count not found.');

  const countDay = count.countDate.toISOString().slice(0, 10); // a @db.Date column: its UTC date IS the day
  const zone = await storeFactoryZone();
  const { txn, delta } = await db.$transaction(async (tx) => {
    await lockStockKeys(tx, [itemLockKey(count.itemId), STXN_SEQ_KEY]);
    const already = await tx.misInventoryLedger.findFirst({
      where: { source: COUNT_ADJUSTMENT_SOURCE, sourceId: count.id },
      select: { id: true },
    });
    if (already) throw new Error('This count has already been reconciled.');

    // B09 — one reconcile per item per count day: another count of this item on the same day that is already settled
    // names itself in the ledger (`source`/`sourceId`), so no column is needed to know.
    const sameDay = await tx.misPhysicalCount.findMany({
      where: { itemId: count.itemId, countDate: count.countDate, id: { not: count.id } },
      select: { id: true },
    });
    if (sameDay.length > 0) {
      const settled = await tx.misInventoryLedger.findFirst({
        where: { source: COUNT_ADJUSTMENT_SOURCE, sourceId: { in: sameDay.map((c) => c.id) } },
        select: { id: true },
      });
      if (settled) throw new Error(`This item was already reconciled for the count of ${countDay}.`);
    }

    // B09 — the adjustment is worked out NOW, under the lock, against what is actually in stock: stock issued since
    // the count was typed must not be written off a second time. The smaller book is the stock (as in the issue check).
    const ledgerBalance = await lastLedgerBalance(tx, count.itemId);
    const txnBalance = await lastTxnBalance(tx, count.itemId);
    const delta = round2(Number(count.physicalQty) - Math.min(ledgerBalance, txnBalance));
    if (delta === 0) throw new Error('This count matches the system: there is nothing to reconcile.');
    await tx.misInventoryLedger.create({
      data: {
        itemId: count.itemId,
        changeQty: delta,
        balanceQty: round2(ledgerBalance + delta),
        source: COUNT_ADJUSTMENT_SOURCE,
        sourceId: count.id,
        notes: `Count ${countDay}: ${why}`,
      },
    });
    const { prefix, next } = await nextTxnSeq(tx, zone);
    const txn = await tx.misStoreTransaction.create({
      data: {
        txnNumber: txnNumberOf(prefix, next),
        itemId: count.itemId,
        type: delta > 0 ? 'IN' : 'OUT',
        quantity: Math.abs(delta),
        balanceQty: round2(txnBalance + delta),
        referenceNo: `Count ${countDay}`,
        reason: why,
        isOverIssue: false,
        createdById: actor.userId,
      },
    });
    return { txn, delta };
  });

  await logAuditEvent({
    action: 'store.count.reconcile',
    entity: 'MisPhysicalCount',
    entityId: count.id,
    actorId: actor.userId,
    after: { itemId: count.itemId, adjustment: String(delta), txnNumber: txn.txnNumber, reason: why },
  });
  return { adjustment: delta };
}

// ---------------------------------------------------------------------------
// MIS-293: Global transaction ledger (all items)
// ---------------------------------------------------------------------------

export type GlobalTxnFilter = {
  itemId?: string;
  type?: 'IN' | 'OUT';
  from?: string; // ISO date YYYY-MM-DD
  to?: string;   // ISO date YYYY-MM-DD
};

export async function listAllStoreTxns(filter: GlobalTxnFilter = {}): Promise<StoreTxnRow[]> {
  await requirePermission('store.read');

  const where: Record<string, unknown> = {};
  if (filter.itemId) where.itemId = filter.itemId;
  if (filter.type) where.type = filter.type;
  if (filter.from || filter.to) {
    // The days are the FACTORY's: "to 14 Oct" runs to the end of the 14th in the factory, not in the server's zone.
    const zone = await storeFactoryZone();
    const dateRange: Record<string, Date> = {};
    if (filter.from) dateRange.gte = factoryDayStart(filter.from, zone);
    if (filter.to) dateRange.lt = factoryDayStart(addDaysToDateKey(filter.to, 1), zone);
    where.createdAt = dateRange;
  }

  const txns = await db.misStoreTransaction.findMany({
    where,
    include: { item: { select: { name: true, code: true, sku: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return txns.map((t) => ({
    id: t.id,
    txnNumber: t.txnNumber,
    itemId: t.itemId,
    itemName: t.item?.name ?? '',
    itemCode: t.item?.code ?? '',
    sku: t.item?.sku ?? null,
    type: t.type as 'IN' | 'OUT',
    quantity: Number(t.quantity),
    balanceQty: Number(t.balanceQty),
    referenceNo: t.referenceNo,
    reason: t.reason,
    isOverIssue: t.isOverIssue,
    createdAt: t.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// MIS-294: Store dashboard stats
// ---------------------------------------------------------------------------

export type StoreDashboardStats = {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  todayIn: number;
  todayOut: number;
  recentTxns: StoreTxnRow[];
  hasDemo: boolean;
  // OWNER only. B16: summed and formatted here; the client only prints it.
  totalStockValue?: number | null;
  /** `formatMoney(totalStockValue)`. */
  totalStockValueLabel?: string | null;
};

/** `now` is injectable so "today" can be tested at the factory's midnight; callers pass nothing. */
export async function getStoreDashboard(now: Date = new Date()): Promise<StoreDashboardStats> {
  const actor = await requirePermission('store.read');

  // "Today" is the factory's day (B15), not the server's UTC day.
  const zone = await storeFactoryZone();
  const todayKey = factoryDateKey(now, zone);
  const todayStart = factoryDayStart(todayKey, zone);
  const tomorrowStart = factoryDayStart(addDaysToDateKey(todayKey, 1), zone);

  const [items, todayTxns, recentTxns, demoCount] = await Promise.all([
    db.misItem.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, reorderLevel: true, pricePerUnit: true },
    }),
    db.misStoreTransaction.findMany({
      where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
      select: { type: true, quantity: true },
    }),
    db.misStoreTransaction.findMany({
      include: { item: { select: { name: true, code: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.misItem.count({ where: { isActive: true, deletedAt: null, isDemo: true } }),
  ]);

  const latest = await getStockBalances();
  const balances = await Promise.all(
    items.map(async (item) => {
      const balance = latest.get(item.id) ?? 0;
      return {
        id: item.id,
        balance,
        reorderLevel: item.reorderLevel != null ? Number(item.reorderLevel) : null,
        price: item.pricePerUnit ? Number(item.pricePerUnit) : null,
      };
    }),
  );

  // B17: the same predicate as the stock page. An item at zero is counted as out of stock, not as low.
  const lowStockCount = balances.filter((b) => b.balance > 0 && isLowStock(b.balance, b.reorderLevel)).length;
  const outOfStockCount = balances.filter((b) => b.balance <= 0).length;
  const todayIn = todayTxns
    .filter((t) => t.type === 'IN')
    .reduce((s, t) => s + Number(t.quantity), 0);
  const todayOut = todayTxns
    .filter((t) => t.type === 'OUT')
    .reduce((s, t) => s + Number(t.quantity), 0);

  const stats: StoreDashboardStats = {
    totalItems: items.length,
    lowStockCount,
    outOfStockCount,
    todayIn,
    todayOut,
    recentTxns: recentTxns.map((t) => ({
      id: t.id,
      txnNumber: t.txnNumber,
      itemId: t.itemId,
      itemName: t.item?.name ?? '',
      itemCode: t.item?.code ?? '',
      sku: t.item?.sku ?? null,
      type: t.type as 'IN' | 'OUT',
      quantity: Number(t.quantity),
      balanceQty: Number(t.balanceQty),
      referenceNo: t.referenceNo,
      reason: t.reason,
      isOverIssue: t.isOverIssue,
      createdAt: t.createdAt,
    })),
    hasDemo: demoCount > 0,
  };

  if (actor.role === 'OWNER') {
    const totalStockValue = round2(
      balances.reduce((sum, b) => (b.price !== null ? sum + round2(b.price * b.balance) : sum), 0),
    );
    stats.totalStockValue = totalStockValue;
    stats.totalStockValueLabel = formatMoney(totalStockValue);
  }

  return stats;
}

// ---------------------------------------------------------------------------
// MIS-285: Update store item properties
// ---------------------------------------------------------------------------

export type StoreItemUpdateInput = {
  pricePerUnit?: number | null;
  reorderLevel?: number | null;
  category?: string;
};

export async function updateStoreItemProps(
  id: string,
  patch: StoreItemUpdateInput,
): Promise<void> {
  const actor = await requirePermission('store.write');

  const before = await db.misItem.findFirst({
    where: { id, isActive: true, deletedAt: null },
    select: { id: true, pricePerUnit: true, reorderLevel: true, category: true },
  });
  if (!before) throw new Error('Item not found');

  // B14 — a friendly refusal, not a database error or a poisoned reorder level.
  if (patch.reorderLevel !== undefined && patch.reorderLevel !== null) {
    if (!Number.isFinite(patch.reorderLevel) || patch.reorderLevel < 0) throw new Error('Reorder level must be a number, zero or more.');
  }
  if (patch.category !== undefined && !(Object.values(MisItemCategory) as string[]).includes(patch.category)) {
    throw new Error(`Category must be one of: ${Object.values(MisItemCategory).join(', ')}.`);
  }

  const data: Record<string, unknown> = {};
  const mayPrice = can(actor.role, 'wages.read'); // D5: the price is the Owner's to set
  if (mayPrice && patch.pricePerUnit !== undefined) {
    data.pricePerUnit = patch.pricePerUnit;
    data.isDemo = false; // setting a real price clears the demo flag
  }
  if (patch.reorderLevel !== undefined) data.reorderLevel = patch.reorderLevel;
  if (patch.category !== undefined) data.category = patch.category;

  const after = await db.misItem.update({ where: { id }, data });

  await logAuditEvent({
    action: 'store.item.update',
    entity: 'MisItem',
    entityId: id,
    actorId: actor.userId,
    before: { pricePerUnit: before.pricePerUnit, reorderLevel: before.reorderLevel, category: before.category },
    after: { pricePerUnit: after.pricePerUnit, reorderLevel: after.reorderLevel, category: after.category },
  });
}

// ---------------------------------------------------------------------------
// MIS-286: Deactivate / soft-delete store item
// ---------------------------------------------------------------------------

export async function deactivateStoreItem(id: string): Promise<void> {
  const actor = await requirePermission('store.write');

  const item = await db.misItem.findFirst({
    where: { id, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!item) throw new Error('Item not found or already inactive');

  const hasTxns = await db.misStoreTransaction.count({ where: { itemId: id } });

  if (hasTxns > 0) {
    // History exists — deactivate but retain record
    await db.misItem.update({ where: { id }, data: { isActive: false } });
  } else {
    // No history — full soft delete
    await db.misItem.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  }

  await logAuditEvent({
    action: 'store.item.deactivate',
    entity: 'MisItem',
    entityId: id,
    actorId: actor.userId,
    after: { hadTxns: hasTxns > 0 },
  });
}

// ---------------------------------------------------------------------------
// MIS-3xx: The cart commit — one delivery or one issue, written in one go
// ---------------------------------------------------------------------------
//
// The storekeeper stands at the gate with a phone and a fifteen-line delivery.
// He piles the lines up in the browser and presses Confirm once; everything
// below happens inside a single transaction, so the factory never sees half a
// delivery.
//
// Two running balances exist in this database and both have to stay true:
//   · mis_inventory_ledger   — the authoritative stock balance (every item has
//                              an OPENING row; GRN and issue rows follow it)
//   · mis_store_transactions — the storekeeper's own IN/OUT book
// Each row carries the balance *after* it, so a new row must be computed from
// the last row of its own chain, never from the other chain and never from a
// number the browser sent. Duplicate lines for one item are merged before any
// of this runs, so one commit writes at most one row per item per chain and
// two rows can never race for the same "previous balance".

export type CartLineInput = {
  itemId: string;
  qty: number;
  /** RECEIVE only — what this delivery charged per unit. */
  rate?: number | null;
};

export type ReceiptMeta = {
  supplierId?: string | null;
  poId?: string | null;
  invoiceNo?: string | null;
  notes?: string | null;
  /** R3-STK B03 — an ADMIN/OWNER's reason for taking more than the order + 2%. Ignored for anyone else. */
  overReceiptReason?: string | null;
  /** R3-STK B11 — one UUID per cart open: pressing Confirm twice books once. */
  idempotencyKey?: string | null;
};

export type IssueMeta = {
  orderId?: string | null;
  departmentId?: string | null;
  notes?: string | null;
  /** R3-STK B11 — one UUID per cart open: pressing Confirm twice books once. */
  idempotencyKey?: string | null;
  /**
   * Runs inside the issue's own transaction, after the ledger rows are written. If it throws, the
   * whole issue rolls back — so a caller's bookkeeping (a request's per-line quantities) commits
   * or fails together with the stock movement, never half of each.
   */
  inTransaction?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type CartCommitResult = {
  /** What to show the storekeeper afterwards — a GRN number, an invoice, or a date. */
  reference: string;
  lineCount: number;
  totalQty: number;
};

/**
 * One line per item, quantities summed.
 *
 * The cart already refuses to create a second line for an item the storekeeper
 * has added, but the server cannot take that on trust: two lines for one item
 * would each read the same "previous balance" and the second would overwrite
 * the first's running total.
 */
function mergeCartLines(lines: CartLineInput[]): CartLineInput[] {
  const merged = new Map<string, CartLineInput>();
  for (const line of lines) {
    // Round to the stored 2 dp BEFORE validating: 0.004 must not pass `> 0` and be stored as 0.00.
    const qty = round2(Number(line.qty));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('Every line needs a quantity greater than zero.');
    }
    const rate = line.rate === null || line.rate === undefined ? null : Number(line.rate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
      throw new Error('A rate cannot be negative.');
    }
    const existing = merged.get(line.itemId);
    if (existing) {
      existing.qty = round2(existing.qty + qty);
      if (rate !== null) existing.rate = rate;
    } else {
      merged.set(line.itemId, { itemId: line.itemId, qty: round2(qty), rate });
    }
  }
  return [...merged.values()];
}

type CartItem = { id: string; name: string; code: string; unit: string; category: string };

async function loadCartItems(lines: CartLineInput[]): Promise<Map<string, CartItem>> {
  const items = await db.misItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) }, isActive: true, deletedAt: null },
    select: { id: true, name: true, code: true, unit: true, category: true },
  });
  const byId = new Map(items.map((item) => [item.id, item as CartItem]));
  for (const line of lines) {
    if (!byId.has(line.itemId)) {
      throw new Error('One of the items in the cart is no longer active. Remove it and try again.');
    }
  }
  return byId;
}

type KeyedKind = 'STORE_RECEIPT' | 'STORE_ISSUE';

/**
 * R3-STK B11 — run a cart commit exactly once per key, on the shared idempotency table (`runIdempotent`, unedited).
 * The key row and the stock rows commit together or not at all, so a second press of Confirm (or a retry after a
 * dropped connection) returns the FIRST result and writes nothing. `live`: the person is at the screen, so a refusal
 * is handed back as the sentence they read and nothing is recorded or parked.
 *
 * The idempotency vocabulary (`QueuedWriteKind`) is the offline queue's closed list; the column itself is free text,
 * and a store kind needs no timing or inbox rule, so the kind is passed through as-is rather than editing that list.
 */
async function runOnce<T extends object>(
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

type ReceiptDone = { reference: string; grnId: string | null; lineCount: number; totalQty: number };

/**
 * Commit a whole delivery.
 *
 * Gated on `grn.write` — OWNER, ADMIN and STORE_GUY, which is exactly the set
 * of people who stand at the gate or answer for what came through it.
 *
 * A GRN header needs a purchase order (mis_grns.po_id is NOT NULL), so a
 * walk-in delivery with no PO posts to the ledger without one rather than
 * inventing a fake PO to hang it from.
 *
 * Against a PO: the PO must be open for goods, a line takes at most ordered + 2% (an ADMIN/OWNER may go beyond with a
 * reason), and the PO-line counters are read and written under the same advisory locks `confirmGRN` takes.
 */
export async function commitReceipt(
  lines: CartLineInput[],
  meta: ReceiptMeta = {},
): Promise<CartCommitResult> {
  const actor = await requirePermission('grn.write');

  // D5: what a delivery charged is money. Only a role holding `wages.read` may set an item's price from a
  // receipt; for everyone else the rate is dropped here, whatever the browser sent.
  const mayPrice = can(actor.role, 'wages.read');
  const cart = mergeCartLines(mayPrice ? lines : lines.map((l) => ({ ...l, rate: null })));
  if (cart.length === 0) throw new Error('Add at least one item before confirming the receipt.');
  const items = await loadCartItems(cart);

  const po = meta.poId
    ? await db.misPurchaseOrder.findUnique({
        where: { id: meta.poId },
        include: { items: { select: { id: true, itemId: true } } },
      })
    : null;
  if (meta.poId && !po) throw new Error('That purchase order no longer exists.');
  if (po) assertPoReceivable(po); // fast refusal; checked again under the locks below

  const invoiceNo = meta.invoiceNo?.trim() || null;
  const notes = meta.notes?.trim() || null;
  const zone = await storeFactoryZone(); // read before the transaction: the runtime pool is one connection wide
  const today = factoryDateKey(new Date(), zone);
  const overrides: { poItemId: string; ordered: number; receivedTotal: number; max: number }[] = [];
  let overrideReason = '';

  const apply = async (tx: Prisma.TransactionClient, attempt: number): Promise<ReceiptDone> => {
    overrides.length = 0;
    const cartItemIds = new Set(cart.map((l) => l.itemId));
    // Serialise the balance read-modify-write per item, the PO-line counters (the same keys confirmGRN takes) and the
    // daily transaction sequence. One sorted set, so two carts can never deadlock.
    await lockStockKeys(tx, [
      ...cart.map((l) => itemLockKey(l.itemId)),
      ...(po ? po.items.filter((pi) => pi.itemId && cartItemIds.has(pi.itemId)).map((pi) => poItemLockKey(pi.id)) : []),
      STXN_SEQ_KEY,
    ]);

    // Fresh PO figures, read under the locks. Plan every line BEFORE any row is written, so a refusal writes nothing.
    type FreshLine = { id: string; itemId: string | null; quantity: { toNumber(): number } | number; receivedQuantity: { toNumber(): number } | number; description?: string | null };
    let freshLines: FreshLine[] = [];
    const planned = new Map<string, FreshLine>();
    if (po) {
      const freshPo = await tx.misPurchaseOrder.findUnique({ where: { id: po.id }, select: { poNumber: true, status: true } });
      if (!freshPo) throw new Error('That purchase order no longer exists.');
      assertPoReceivable(freshPo);
      freshLines = (await tx.misPoItem.findMany({
        where: { poId: po.id },
        select: { id: true, itemId: true, quantity: true, receivedQuantity: true, description: true },
      })) as FreshLine[];
      const toNum = (v: FreshLine['quantity']) => (typeof v === 'number' ? v : v.toNumber());
      const claimed = new Set<string>();
      for (const line of cart) {
        const candidates = freshLines.filter((pl) => pl.itemId === line.itemId && !claimed.has(pl.id));
        if (candidates.length === 0) continue; // an item the PO does not list: stock moves, no GRN line
        const roomy = (pl: FreshLine) => roundQty(toNum(pl.receivedQuantity) + line.qty) <= toNum(pl.quantity);
        const withinTolerance = (pl: FreshLine) =>
          receiptVerdict({ ordered: toNum(pl.quantity), receivedSoFar: toNum(pl.receivedQuantity), qty: line.qty, role: actor.role }).kind === 'OK';
        // The first line with outstanding room; else the first within the 2% tolerance; else the first (and let the cap speak).
        const chosen = candidates.find(roomy) ?? candidates.find(withinTolerance) ?? candidates[0];
        const verdict = enforceReceiptCap(actor.role, chosen, line.qty, 0, meta.overReceiptReason);
        if (verdict.kind === 'OVERRIDE') {
          overrideReason = verdict.reason;
          overrides.push({ poItemId: chosen.id, ordered: toNum(chosen.quantity), receivedTotal: verdict.receivedTotal, max: verdict.max });
        }
        claimed.add(chosen.id);
        planned.set(line.itemId, chosen);
      }
    }

    let grnId: string | null = null;
    let grnNumber: string | null = null;

    if (po) {
      const headerNotes = [invoiceNo ? `Invoice ${invoiceNo}` : null, notes]
        .filter(Boolean)
        .join(' · ');
      const grn = await tx.misGrn.create({
        data: {
          grnNumber: nextGrnNumber(attempt, zone),
          poId: po.id,
          // Confirmed on creation: the ledger rows below are written in the
          // same breath, so leaving it DRAFT would let confirmGRN post them a
          // second time.
          status: 'CONFIRMED',
          receivedAt: new Date(),
          receivedById: actor.userId,
          notes: headerNotes || null,
          supplierInvoiceNo: invoiceNo,
        },
      });
      grnId = grn.id;
      grnNumber = grn.grnNumber;
      // V2 Epic 1: the cart receipt is a confirmed GRN, so its invoice is a leg of the 3-way match too.
      if (invoiceNo) {
        await tx.misSupplierInvoice.upsert({
          where: { poId_invoiceNo: { poId: po.id, invoiceNo } },
          create: { poId: po.id, invoiceNo, grnId: grn.id, supplierId: po.supplierId },
          update: { grnId: grn.id },
        });
      }
    }

    const reference = grnNumber ?? invoiceNo ?? `Receipt ${today}`;
    const { prefix, next } = await nextTxnSeq(tx, zone);
    const received = new Map<string, number>(); // PO line id -> quantity this delivery added
    let seq = next;
    let totalQty = 0;

    for (const line of cart) {
      const item = items.get(line.itemId)!;

      // Inventory ledger — the authoritative balance.
      const ledgerBalance = await lastLedgerBalance(tx, item.id);
      const newLedgerBalance = round2(ledgerBalance + line.qty);
      await tx.misInventoryLedger.create({
        data: {
          itemId: item.id,
          changeQty: line.qty,
          balanceQty: newLedgerBalance,
          source: grnId ? 'GRN' : 'STORE_RECEIPT',
          sourceId: grnId,
          notes: reference,
        },
      });

      // The storekeeper's IN/OUT book, on its own running balance.
      const txnBalance = await lastTxnBalance(tx, item.id);
      await tx.misStoreTransaction.create({
        data: {
          txnNumber: txnNumberOf(prefix, seq),
          itemId: item.id,
          type: 'IN',
          quantity: line.qty,
          balanceQty: round2(txnBalance + line.qty),
          referenceNo: reference,
          reason: notes,
          isOverIssue: false,
          createdById: actor.userId,
        },
      });
      seq += 1;

      // Against the PO, where the delivery matches a line on it.
      const poItem = planned.get(item.id);
      if (grnId && poItem) {
        received.set(poItem.id, round2((received.get(poItem.id) ?? 0) + line.qty));
        await tx.misGrnItem.create({
          data: { grnId, poItemId: poItem.id, receivedQty: line.qty, type: 'GENERAL' },
        });
        await tx.misPoItem.update({
          where: { id: poItem.id },
          data: { receivedQuantity: { increment: line.qty } },
        });
        // V2 Epic 2: a PO raised against an order (its BOM ref IS the order number) earmarks
        // the delivery for that order. Any other ref lands in general stock, as before.
        await allocateFromReceipt(tx, { ref: po!.bomRef, itemId: item.id, qty: line.qty, sourceId: grnId });
      }

      // What the delivery actually charged, so the next reorder is not priced
      // off a guess. Never written into the audit payload.
      if (mayPrice && line.rate !== null && line.rate !== undefined && line.rate > 0) {
        await tx.misItem.update({
          where: { id: item.id },
          data: { pricePerUnit: line.rate, isDemo: false },
        });
      }

      totalQty = round2(totalQty + line.qty);
    }

    // Move the PO on, so a fully received order stops showing as open. Only
    // when something on this delivery actually matched a line of it — a
    // delivery booked to a PO it shares no items with has not part-filled it.
    if (po && received.size > 0) {
      const toNum = (v: FreshLine['quantity']) => (typeof v === 'number' ? v : v.toNumber());
      const status = poStatusAfterReceipt(
        freshLines.map((l) => ({ quantity: toNum(l.quantity), receivedQuantity: roundQty(toNum(l.receivedQuantity) + (received.get(l.id) ?? 0)) })),
      );
      if (status) await tx.misPurchaseOrder.update({ where: { id: po.id }, data: { status } });
    }

    return { reference, grnId, lineCount: cart.length, totalQty };
  };

  // A clash on the GRN number (two receipts in the same instant) is retried with a new number, as createGRN does.
  let result: ReceiptDone;
  let replay = false;
  for (let attempt = 0; ; attempt += 1) {
    try {
      if (meta.idempotencyKey) {
        const keyed = await runOnce<ReceiptDone>(
          'STORE_RECEIPT',
          meta.idempotencyKey,
          actor.userId,
          // Quantities only: a rate is money and never rests in the idempotency table.
          { itemIds: cart.map((l) => l.itemId), poId: meta.poId ?? null },
          'MisGrn',
          async (tx) => {
            const done = await apply(tx, attempt);
            return { entityId: done.grnId, result: done };
          },
        );
        result = keyed.value;
        replay = keyed.replay;
      } else {
        result = await db.$transaction((tx) => apply(tx, attempt));
      }
      break;
    } catch (error) {
      if (!isGrnNumberClash(error) || attempt >= GRN_NUMBER_ATTEMPTS - 1) throw error;
    }
  }

  // The first call already notified and audited; a replay answers with the same result and stops there.
  if (replay) return { reference: result.reference, lineCount: result.lineCount, totalQty: result.totalQty };

  if (result.grnId) await notifyGrnConfirmed(result.grnId); // V2 Epic 4 — same alert as the GRN screen's confirm

  await logAuditEvent({
    actorId: actor.userId,
    action: 'store.receipt.commit',
    entity: grnEntity(result.grnId),
    entityId: result.grnId ?? null,
    after: {
      reference: result.reference,
      lineCount: result.lineCount,
      totalQty: String(result.totalQty),
      poId: meta.poId ?? null,
      supplierId: meta.supplierId ?? null,
      itemIds: cart.map((l) => l.itemId),
    },
  });
  if (overrides.length > 0) await auditOverReceipt(actor.userId, result.grnId, overrides, overrideReason);

  return { reference: result.reference, lineCount: result.lineCount, totalQty: result.totalQty };
}

function grnEntity(grnId: string | null): string {
  return grnId ? 'MisGrn' : 'MisStoreTransaction';
}

/**
 * Commit a whole issue to production.
 *
 * Gated on `store.write` — OWNER, ADMIN and STORE_GUY.
 *
 * The balance check lives here, inside the transaction, and not only in the
 * browser: the UI's copy of the balance was fetched when the page loaded and
 * may be minutes old. Every line is checked before any row is written, so a
 * fifteen-line issue with one bad line writes nothing at all and the
 * storekeeper is told which item and how much of it he actually has.
 */
export async function commitIssue(
  lines: CartLineInput[],
  meta: IssueMeta = {},
): Promise<CartCommitResult> {
  const actor = await requirePermission('store.write');

  const cart = mergeCartLines(lines);
  if (cart.length === 0) throw new Error('Add at least one item before confirming the issue.');
  const items = await loadCartItems(cart);

  const [order, department] = await Promise.all([
    meta.orderId
      ? db.misOrder.findUnique({ where: { id: meta.orderId }, select: { orderNumber: true, status: true } })
      : Promise.resolve(null),
    meta.departmentId
      ? db.misDepartment.findUnique({ where: { id: meta.departmentId }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  if (meta.orderId && !order) throw new Error('That order no longer exists — reload and pick again.');
  if (meta.departmentId && !department) throw new Error('That department no longer exists — reload and pick again.');
  // A closed order takes no more stock (CANCELLED / DELIVERED / COMPLETED — the one shared list).
  if (order && order.status && isOrderClosed(order.status)) {
    throw new Error(`${order.orderNumber} is ${order.status.toLowerCase().replace(/_/g, ' ')} — stock cannot be issued against a closed order.`);
  }
  // The category rule lives here, not only in the request form: every path that moves stock out
  // goes through this function, so equipment cannot be booked to an order by any door.
  const refusal = categoryRefusal(
    cart.map((l) => ({ name: items.get(l.itemId)!.name, category: items.get(l.itemId)!.category })),
    { orderId: meta.orderId, departmentId: meta.departmentId },
  );
  if (refusal) throw new Error(refusal);

  const notes = meta.notes?.trim() || null;
  const zone = await storeFactoryZone(); // read before the transaction: the runtime pool is one connection wide
  const reference =
    order?.orderNumber ?? department?.name ?? `Issue ${factoryDateKey(new Date(), zone)}`;
  const reason = [department ? `To ${department.name}` : null, notes].filter(Boolean).join(' · ') || null;

  const apply = async (tx: Prisma.TransactionClient): Promise<CartCommitResult> => {
    // One issue at a time per item. The balance read, the order-cap read and the ledger write below
    // are a read-modify-write; without the lock two concurrent issues both read the same balance
    // and both pass. Transaction-scoped, so it is released by commit/rollback (pooler-safe).
    await lockStockKeys(tx, [...cart.map((l) => itemLockKey(l.itemId)), STXN_SEQ_KEY]);

    // Read every balance first and refuse the whole cart if any line is short. B08: the stock is the SMALLER of the
    // two books (as createStoreOut checks), so an item the storekeeper's book has not caught up on cannot go negative.
    const ledgerBalances = new Map<string, number>();
    const txnBalances = new Map<string, number>();
    const shortfalls: { label: string; available: number; unit: string }[] = [];
    for (const line of cart) {
      const item = items.get(line.itemId)!;
      const ledgerBalance = await lastLedgerBalance(tx, item.id);
      const txnBalance = await lastTxnBalance(tx, item.id);
      ledgerBalances.set(item.id, ledgerBalance);
      txnBalances.set(item.id, txnBalance);
      const available = round2(Math.max(0, Math.min(ledgerBalance, txnBalance)));
      if (line.qty > available) shortfalls.push({ label: `${item.name} (${item.code})`, available, unit: item.unit });
    }
    if (shortfalls.length === 1) {
      const [one] = shortfalls;
      throw new Error(`Cannot issue more than the stock balance (${one.available} available): ${one.label}`);
    }
    if (shortfalls.length > 1) {
      throw new Error(`Cannot issue more than the stock balance: ${shortfalls.map((f) => `${f.label} (${f.available} ${f.unit} available)`).join(' · ')}`);
    }
    // V2 Epic 2: against an order, (issued so far + this) may not exceed what was earmarked for it.
    if (meta.orderId) {
      const over = await allocationShortfalls(
        tx,
        meta.orderId,
        cart.map((l) => ({ itemId: l.itemId, qty: l.qty, label: `${items.get(l.itemId)!.name} (${items.get(l.itemId)!.code})` })),
      );
      if (over.length > 0) throw new OrderStockQuotaExceededError(meta.orderId, over);
    }

    const { prefix, next } = await nextTxnSeq(tx, zone);
    let seq = next;
    let totalQty = 0;

    for (const line of cart) {
      const item = items.get(line.itemId)!;

      const newLedgerBalance = round2(ledgerBalances.get(item.id)! - line.qty);
      await tx.misInventoryLedger.create({
        data: {
          itemId: item.id,
          changeQty: -line.qty,
          balanceQty: newLedgerBalance,
          source: 'STORE_ISSUE',
          sourceId: meta.orderId ?? null,
          notes: reference,
        },
      });

      await tx.misStoreTransaction.create({
        data: {
          txnNumber: txnNumberOf(prefix, seq),
          itemId: item.id,
          type: 'OUT',
          quantity: line.qty,
          balanceQty: round2(txnBalances.get(item.id)! - line.qty),
          referenceNo: reference,
          reason,
          // D2: stock never goes negative, so there is no over-issue (the check above uses the smaller book).
          isOverIssue: false,
          createdById: actor.userId,
        },
      });
      seq += 1;
      totalQty = round2(totalQty + line.qty);
    }

    await meta.inTransaction?.(tx);

    return { reference, lineCount: cart.length, totalQty };
  };

  let result: CartCommitResult;
  if (meta.idempotencyKey) {
    const keyed = await runOnce<CartCommitResult>(
      'STORE_ISSUE',
      meta.idempotencyKey,
      actor.userId,
      { itemIds: cart.map((l) => l.itemId), orderId: meta.orderId ?? null, departmentId: meta.departmentId ?? null },
      'MisStoreTransaction',
      async (tx) => ({ entityId: null, result: await apply(tx) }),
    );
    if (keyed.replay) return keyed.value; // the first call already audited it
    result = keyed.value;
  } else {
    result = await db.$transaction((tx) => apply(tx));
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: 'store.issue.commit',
    entity: 'MisStoreTransaction',
    entityId: null,
    after: {
      reference: result.reference,
      lineCount: result.lineCount,
      totalQty: String(result.totalQty),
      orderId: meta.orderId ?? null,
      departmentId: meta.departmentId ?? null,
      itemIds: cart.map((l) => l.itemId),
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// What the cart screens need to draw themselves
// ---------------------------------------------------------------------------

export type PickerItemRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  balance: number;
};

/**
 * Every item the picker can find, with its authoritative balance.
 *
 * One grouped query for the balances rather than 176 round trips — the
 * storekeeper is on a phone at a gate, and listStoreItems()'s per-item loop is
 * already the slowest thing in the module.
 */
export async function listPickerItems(): Promise<PickerItemRow[]> {
  await requirePermission('store.read');

  const items = await db.misItem.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ name: 'asc' }],
    select: { id: true, code: true, name: true, unit: true },
  });

  const balances = new Map<string, number>();
  const rows = await db.$queryRaw<{ item_id: string; balance_qty: unknown }[]>`
    SELECT DISTINCT ON (item_id) item_id, balance_qty
    FROM mis_inventory_ledger
    ORDER BY item_id, created_at DESC
  `;
  for (const row of rows) balances.set(row.item_id, Number(row.balance_qty));

  return items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    balance: balances.get(item.id) ?? 0,
  }));
}

/** Suppliers a delivery can be booked against. */
export async function listReceiveSuppliers(): Promise<{ id: string; name: string; code: string }[]> {
  await requirePermission('store.read');
  const rows = await db.misSupplier.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });
  return rows;
}

export type OpenPoRow = {
  id: string;
  poNumber: string;
  supplierId: string | null;
  supplierName: string | null;
  /** FOR_ORDER carries a BOM reference; BUFFER_STOCK has none and needs none. */
  purpose: PoPurpose;
  itemIds: string[];
};

/** Purchase orders still expecting goods. */
export async function listOpenPOs(): Promise<OpenPoRow[]> {
  await requirePermission('store.read');
  const pos = await db.misPurchaseOrder.findMany({
    where: { status: { in: ['APPROVED', 'RECEIVING', 'PARTIAL'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      supplier: { select: { id: true, name: true } },
      items: { select: { itemId: true } },
    },
  });
  return pos.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplier?.id ?? null,
    supplierName: po.supplier?.name ?? null,
    purpose: poPurpose(po),
    itemIds: po.items.map((i) => i.itemId).filter((id): id is string => Boolean(id)),
  }));
}

/** Where an issue can be booked to. */
export async function listIssueTargets(): Promise<{
  orders: { id: string; orderNumber: string; customerName: string | null }[];
  departments: { id: string; name: string }[];
}> {
  await requirePermission('store.read');
  const [orders, departments] = await Promise.all([
    db.misOrder.findMany({
      where: { status: { in: ['CONFIRMED', 'IN_PRODUCTION'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderNumber: true, customer: { select: { name: true } } },
    }),
    db.misDepartment.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ]);
  return {
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer?.name ?? null,
    })),
    departments,
  };
}
