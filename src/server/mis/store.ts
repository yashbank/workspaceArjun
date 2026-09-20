import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';
import { nextGrnNumber } from './grn';
import { poPurpose, type PoPurpose } from '@/lib/mis/po-purpose';

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

/** Next txn number: STXN-YYYYMMDD-NNNN (daily sequence). */
async function nextTxnNumber(): Promise<string> {
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `STXN-${ymd}-`;
  const last = await db.misStoreTransaction.findFirst({
    where: { txnNumber: { startsWith: prefix } },
    orderBy: { txnNumber: 'desc' },
    select: { txnNumber: true },
  });
  const seq = last ? parseInt(last.txnNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
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

  const rows: StoreItemRow[] = await Promise.all(
    items.map(async (item) => {
      const balance = await getStockBalance(item.id);
      const row: StoreItemRow = {
        id: item.id,
        code: item.code,
        sku: item.sku,
        name: item.name,
        category: item.category,
        unit: item.unit,
        reorderLevel: item.reorderLevel ? Number(item.reorderLevel) : null,
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

  if (input.quantity <= 0) throw new Error('Quantity must be positive');

  const item = await db.misItem.findFirst({
    where: { id: input.itemId, isActive: true, deletedAt: null },
    select: { id: true, name: true, code: true, sku: true },
  });
  if (!item) throw new Error('Item not found or inactive');

  const currentBalance = await getStockBalance(input.itemId);
  const newBalance = currentBalance + input.quantity;
  const txnNumber = await nextTxnNumber();

  const txn = await db.misStoreTransaction.create({
    data: {
      txnNumber,
      itemId: input.itemId,
      type: 'IN',
      quantity: input.quantity,
      balanceQty: newBalance,
      referenceNo: input.referenceNo ?? null,
      reason: input.notes ?? null,
      isOverIssue: false,
      createdById: actor.userId,
    },
  });

  await logAuditEvent({
    action: 'store.in',
    entity: 'MisStoreTransaction',
    entityId: txn.id,
    actorId: actor.userId,
    after: { itemId: input.itemId, quantity: input.quantity, txnNumber, newBalance: String(newBalance) },
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
  reason?: string; // mandatory when over-issue
};

export async function createStoreOut(input: StoreOutInput): Promise<StoreTxnRow> {
  const actor = await requirePermission('store.write');

  if (input.quantity <= 0) throw new Error('Quantity must be positive');

  const item = await db.misItem.findFirst({
    where: { id: input.itemId, isActive: true, deletedAt: null },
    select: { id: true, name: true, code: true, sku: true },
  });
  if (!item) throw new Error('Item not found or inactive');

  const currentBalance = await getStockBalance(input.itemId);
  const isOverIssue = input.quantity > currentBalance;

  if (isOverIssue && !input.reason?.trim()) {
    throw new Error('Reason is required when issuing more than the current stock balance');
  }

  const newBalance = currentBalance - input.quantity;
  const txnNumber = await nextTxnNumber();

  const txn = await db.misStoreTransaction.create({
    data: {
      txnNumber,
      itemId: input.itemId,
      type: 'OUT',
      quantity: input.quantity,
      balanceQty: newBalance,
      referenceNo: input.referenceNo ?? null,
      reason: input.reason ?? null,
      isOverIssue,
      createdById: actor.userId,
    },
  });

  await logAuditEvent({
    action: 'store.out',
    entity: 'MisStoreTransaction',
    entityId: txn.id,
    actorId: actor.userId,
    after: { itemId: input.itemId, quantity: input.quantity, txnNumber, newBalance: String(newBalance), isOverIssue },
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
    isOverIssue,
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
  // OWNER only
  pricePerUnit?: number | null;
  stockValue?: number | null;
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

  return Promise.all(
    items.map(async (item) => {
      const balance = await getStockBalance(item.id);
      const reorderLevel = item.reorderLevel ? Number(item.reorderLevel) : null;
      const row: StockSummaryRow = {
        id: item.id,
        code: item.code,
        sku: item.sku,
        name: item.name,
        category: item.category,
        unit: item.unit,
        stockBalance: balance,
        reorderLevel,
        belowReorder: reorderLevel !== null && balance <= reorderLevel,
        isDemo: item.isDemo,
      };
      if (actor.role === 'OWNER') {
        const price = item.pricePerUnit ? Number(item.pricePerUnit) : null;
        row.pricePerUnit = price;
        row.stockValue = price !== null ? price * balance : null;
      }
      return row;
    }),
  );
}

// ---------------------------------------------------------------------------
// MIS-292: Physical count entry
// ---------------------------------------------------------------------------

export type PhysicalCountInput = {
  itemId: string;
  physicalQty: number;
  countDate: string; // ISO date YYYY-MM-DD
  notes?: string;
};

export async function recordPhysicalCount(input: PhysicalCountInput): Promise<PhysicalCountRow> {
  const actor = await requirePermission('store.count');

  const item = await db.misItem.findFirst({
    where: { id: input.itemId, isActive: true, deletedAt: null },
    select: { id: true, name: true, code: true },
  });
  if (!item) throw new Error('Item not found');

  const systemQty = await getStockBalance(input.itemId);
  const discrepancy = input.physicalQty - systemQty;

  const count = await db.misPhysicalCount.create({
    data: {
      itemId: input.itemId,
      countDate: new Date(input.countDate),
      physicalQty: input.physicalQty,
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
    after: { itemId: input.itemId, physicalQty: String(input.physicalQty), systemQty: String(systemQty), discrepancy: String(discrepancy) },
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

  return counts.map((c) => ({
    id: c.id,
    itemId: c.itemId,
    itemName: c.item?.name ?? '',
    countDate: c.countDate.toISOString().slice(0, 10),
    physicalQty: Number(c.physicalQty),
    systemQty: Number(c.systemQty),
    discrepancy: Number(c.discrepancy),
    notes: c.notes,
    createdAt: c.createdAt,
  }));
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
    const dateRange: Record<string, Date> = {};
    if (filter.from) dateRange.gte = new Date(filter.from);
    if (filter.to) {
      const d = new Date(filter.to);
      d.setHours(23, 59, 59, 999);
      dateRange.lte = d;
    }
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
  // OWNER only
  totalStockValue?: number | null;
};

export async function getStoreDashboard(): Promise<StoreDashboardStats> {
  const actor = await requirePermission('store.read');

  const todayStart = new Date(new Date().toISOString().slice(0, 10));

  const [items, todayTxns, recentTxns, demoCount] = await Promise.all([
    db.misItem.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, reorderLevel: true, pricePerUnit: true },
    }),
    db.misStoreTransaction.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { type: true, quantity: true },
    }),
    db.misStoreTransaction.findMany({
      include: { item: { select: { name: true, code: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.misItem.count({ where: { isActive: true, deletedAt: null, isDemo: true } }),
  ]);

  const balances = await Promise.all(
    items.map(async (item) => {
      const balance = await getStockBalance(item.id);
      return {
        id: item.id,
        balance,
        reorderLevel: item.reorderLevel ? Number(item.reorderLevel) : null,
        price: item.pricePerUnit ? Number(item.pricePerUnit) : null,
      };
    }),
  );

  const lowStockCount = balances.filter(
    (b) => b.reorderLevel !== null && b.balance > 0 && b.balance < b.reorderLevel,
  ).length;
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
    const totalStockValue = balances.reduce((sum, b) => {
      return b.price !== null ? sum + b.price * b.balance : sum;
    }, 0);
    stats.totalStockValue = totalStockValue;
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

  const data: Record<string, unknown> = {};
  if (patch.pricePerUnit !== undefined) {
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
};

export type IssueMeta = {
  orderId?: string | null;
  departmentId?: string | null;
  notes?: string | null;
};

export type CartCommitResult = {
  /** What to show the storekeeper afterwards — a GRN number, an invoice, or a date. */
  reference: string;
  lineCount: number;
  totalQty: number;
};

/** Money and weights are 2dp in the schema; keep float drift out of the ledger. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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
    const qty = Number(line.qty);
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

type CartItem = { id: string; name: string; code: string; unit: string };

async function loadCartItems(lines: CartLineInput[]): Promise<Map<string, CartItem>> {
  const items = await db.misItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) }, isActive: true, deletedAt: null },
    select: { id: true, name: true, code: true, unit: true },
  });
  const byId = new Map(items.map((item) => [item.id, item as CartItem]));
  for (const line of lines) {
    if (!byId.has(line.itemId)) {
      throw new Error('One of the items in the cart is no longer active. Remove it and try again.');
    }
  }
  return byId;
}

/** Daily store-transaction sequence, read inside the caller's transaction. */
async function nextTxnSeq(tx: Prisma.TransactionClient): Promise<{ prefix: string; next: number }> {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `STXN-${ymd}-`;
  const last = await tx.misStoreTransaction.findFirst({
    where: { txnNumber: { startsWith: prefix } },
    orderBy: { txnNumber: 'desc' },
    select: { txnNumber: true },
  });
  return { prefix, next: last ? parseInt(last.txnNumber.slice(prefix.length), 10) + 1 : 1 };
}

async function lastLedgerBalance(tx: Prisma.TransactionClient, itemId: string): Promise<number> {
  const last = await tx.misInventoryLedger.findFirst({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    select: { balanceQty: true },
  });
  return last ? last.balanceQty.toNumber() : 0;
}

async function lastTxnBalance(tx: Prisma.TransactionClient, itemId: string): Promise<number> {
  const last = await tx.misStoreTransaction.findFirst({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    select: { balanceQty: true },
  });
  return last ? last.balanceQty.toNumber() : 0;
}

/**
 * Commit a whole delivery.
 *
 * Gated on `grn.write` — OWNER, ADMIN and STORE_GUY, which is exactly the set
 * of people who stand at the gate or answer for what came through it.
 *
 * A GRN header needs a purchase order (mis_grns.po_id is NOT NULL), so a
 * walk-in delivery with no PO posts to the ledger without one rather than
 * inventing a fake PO to hang it from.
 */
export async function commitReceipt(
  lines: CartLineInput[],
  meta: ReceiptMeta = {},
): Promise<CartCommitResult> {
  const actor = await requirePermission('grn.write');

  const cart = mergeCartLines(lines);
  if (cart.length === 0) throw new Error('Add at least one item before confirming the receipt.');
  const items = await loadCartItems(cart);

  const po = meta.poId
    ? await db.misPurchaseOrder.findUnique({
        where: { id: meta.poId },
        include: { items: { select: { id: true, itemId: true, quantity: true, receivedQuantity: true } } },
      })
    : null;
  if (meta.poId && !po) throw new Error('That purchase order no longer exists.');

  const invoiceNo = meta.invoiceNo?.trim() || null;
  const notes = meta.notes?.trim() || null;

  const result = await db.$transaction(async (tx) => {
    let grnId: string | null = null;
    let grnNumber: string | null = null;

    if (po) {
      const headerNotes = [invoiceNo ? `Invoice ${invoiceNo}` : null, notes]
        .filter(Boolean)
        .join(' · ');
      const grn = await tx.misGrn.create({
        data: {
          grnNumber: nextGrnNumber(),
          poId: po.id,
          // Confirmed on creation: the ledger rows below are written in the
          // same breath, so leaving it DRAFT would let confirmGRN post them a
          // second time.
          status: 'CONFIRMED',
          receivedAt: new Date(),
          receivedById: actor.userId,
          notes: headerNotes || null,
        },
      });
      grnId = grn.id;
      grnNumber = grn.grnNumber;
    }

    const reference = grnNumber ?? invoiceNo ?? `Receipt ${new Date().toISOString().slice(0, 10)}`;
    const { prefix, next } = await nextTxnSeq(tx);
    const claimedPoItems = new Set<string>();
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
          txnNumber: `${prefix}${String(seq).padStart(4, '0')}`,
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
      const poItem = po?.items.find(
        (pi) => pi.itemId === item.id && !claimedPoItems.has(pi.id),
      );
      if (grnId && poItem) {
        claimedPoItems.add(poItem.id);
        await tx.misGrnItem.create({
          data: { grnId, poItemId: poItem.id, receivedQty: line.qty, type: 'GENERAL' },
        });
        await tx.misPoItem.update({
          where: { id: poItem.id },
          data: { receivedQuantity: { increment: line.qty } },
        });
      }

      // What the delivery actually charged, so the next reorder is not priced
      // off a guess. Never written into the audit payload.
      if (line.rate !== null && line.rate !== undefined && line.rate > 0) {
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
    if (po && claimedPoItems.size > 0) {
      const after = await tx.misPoItem.findMany({
        where: { poId: po.id },
        select: { quantity: true, receivedQuantity: true },
      });
      const complete =
        after.length > 0 &&
        after.every((pi) => pi.receivedQuantity.toNumber() >= pi.quantity.toNumber());
      await tx.misPurchaseOrder.update({
        where: { id: po.id },
        data: { status: complete ? 'COMPLETE' : 'PARTIAL' },
      });
    }

    return { reference, grnId, lineCount: cart.length, totalQty };
  });

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
      ? db.misOrder.findUnique({ where: { id: meta.orderId }, select: { orderNumber: true } })
      : Promise.resolve(null),
    meta.departmentId
      ? db.misDepartment.findUnique({ where: { id: meta.departmentId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  const notes = meta.notes?.trim() || null;
  const reference =
    order?.orderNumber ?? department?.name ?? `Issue ${new Date().toISOString().slice(0, 10)}`;
  const reason = [department ? `To ${department.name}` : null, notes].filter(Boolean).join(' · ') || null;

  const result = await db.$transaction(async (tx) => {
    // Read every balance first and refuse the whole cart if any line is short.
    const balances = new Map<string, number>();
    const shortfalls: string[] = [];
    for (const line of cart) {
      const item = items.get(line.itemId)!;
      const balance = await lastLedgerBalance(tx, item.id);
      balances.set(item.id, balance);
      if (line.qty > balance) {
        shortfalls.push(
          `${item.name} (${item.code}) — asked for ${line.qty} ${item.unit}, only ${balance} ${item.unit} in stock`,
        );
      }
    }
    if (shortfalls.length > 0) {
      throw new Error(`Cannot issue more than the stock balance: ${shortfalls.join(' · ')}`);
    }

    const { prefix, next } = await nextTxnSeq(tx);
    let seq = next;
    let totalQty = 0;

    for (const line of cart) {
      const item = items.get(line.itemId)!;

      const newLedgerBalance = round2(balances.get(item.id)! - line.qty);
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

      const txnBalance = await lastTxnBalance(tx, item.id);
      await tx.misStoreTransaction.create({
        data: {
          txnNumber: `${prefix}${String(seq).padStart(4, '0')}`,
          itemId: item.id,
          type: 'OUT',
          quantity: line.qty,
          balanceQty: round2(txnBalance - line.qty),
          referenceNo: reference,
          reason,
          // The two books disagree on a handful of legacy items; if this issue
          // drives the storekeeper's own book negative, say so rather than
          // quietly recording a negative balance.
          isOverIssue: line.qty > txnBalance,
          createdById: actor.userId,
        },
      });
      seq += 1;
      totalQty = round2(totalQty + line.qty);
    }

    return { reference, lineCount: cart.length, totalQty };
  });

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
