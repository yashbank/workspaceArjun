import type { Prisma } from '@/generated/prisma/client';
import { issueRefusal, orderNumberFromRef, remainingAllocation, type AllocationFigures } from '@/lib/mis/order-allocation';
import { db } from '@/server/db';

import { requirePermission } from './auth';

/**
 * V2 Epic 2 — earmarking received stock for an order, and reading the earmark back.
 *
 * The two writers (`grn.ts#confirmGRN`, `store.ts#commitReceipt`) call `allocateFromReceipt`
 * inside their own transaction; `commitIssue` calls `allocationFigures` inside its. Neither is a
 * door: both run only after the caller's gate, on the caller's `tx`.
 */

type Tx = Prisma.TransactionClient;

/** Earmark `qty` of `itemId` for the order that `ref` names. Returns the order id, or null when `ref` is not an order number or names no order. */
export async function allocateFromReceipt(
  tx: Tx,
  input: { ref: string | null | undefined; itemId: string; qty: number; sourceId: string },
): Promise<string | null> {
  const orderNumber = orderNumberFromRef(input.ref);
  if (!orderNumber || input.qty <= 0) return null;
  const order = await tx.misOrder.findFirst({ where: { orderNumber }, select: { id: true } });
  if (!order) return null;
  await tx.misOrderStockAllocation.create({
    data: { orderId: order.id, itemId: input.itemId, allocatedQty: input.qty, source: 'GRN', sourceId: input.sourceId },
  });
  return order.id;
}

/** Allocated and already-issued totals per item for one order. Items with no allocation are absent. */
export async function allocationFigures(tx: Tx, orderId: string, itemIds: string[]): Promise<Map<string, AllocationFigures>> {
  const [allocations, issues] = await Promise.all([
    tx.misOrderStockAllocation.findMany({ where: { orderId, itemId: { in: itemIds } }, select: { itemId: true, allocatedQty: true, createdAt: true } }),
    tx.misInventoryLedger.findMany({
      where: { source: 'STORE_ISSUE', sourceId: orderId, itemId: { in: itemIds } },
      select: { itemId: true, changeQty: true, createdAt: true },
    }),
  ]);
  const out = new Map<string, AllocationFigures & { since: Date }>();
  for (const a of allocations) {
    const f = out.get(a.itemId) ?? { allocated: 0, issued: 0, since: a.createdAt };
    f.allocated += a.allocatedQty.toNumber();
    if (a.createdAt < f.since) f.since = a.createdAt;
    out.set(a.itemId, f);
  }
  // Issues made from general stock BEFORE the order's first earmark of an item are not drawn
  // against that earmark — otherwise a long-running order's first FOR_ORDER delivery would lock it.
  for (const i of issues) {
    const f = out.get(i.itemId);
    if (f && i.createdAt >= f.since) f.issued += -i.changeQty.toNumber();
  }
  return new Map([...out].map(([k, { allocated, issued }]) => [k, { allocated, issued }]));
}

/** The refusal messages for a cart against an order — empty when every line fits its allocation. */
export async function allocationShortfalls(
  tx: Tx,
  orderId: string,
  lines: { itemId: string; qty: number; label: string }[],
): Promise<string[]> {
  const figures = await allocationFigures(tx, orderId, lines.map((l) => l.itemId));
  return lines
    .map((l) => issueRefusal(figures.get(l.itemId) ?? { allocated: 0, issued: 0 }, l.qty, l.label))
    .filter((m): m is string => m !== null);
}

export type OrderAllocationRow = {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  allocated: number;
  issued: number;
  remaining: number;
};

/** For the issue screen: every open order's earmarks, keyed by order id, so the cart can show what is left before Confirm. */
export async function listOpenOrderAllocations(): Promise<Record<string, OrderAllocationRow[]>> {
  await requirePermission('store.read');
  // Two queries for every open order at once (not two per order): the earmarks, then the issues
  // against those orders. The same "issues after the first earmark" rule as allocationFigures.
  const allocations = await db.misOrderStockAllocation.findMany({
    where: { order: { status: { in: ['CONFIRMED', 'IN_PRODUCTION'] } } },
    select: { orderId: true, itemId: true, allocatedQty: true, createdAt: true, item: { select: { code: true, name: true, unit: true } } },
  });
  if (allocations.length === 0) return {};
  const orderIds = [...new Set(allocations.map((a) => a.orderId))];
  const issues = await db.misInventoryLedger.findMany({
    where: { source: 'STORE_ISSUE', sourceId: { in: orderIds } },
    select: { sourceId: true, itemId: true, changeQty: true, createdAt: true },
  });
  type Acc = AllocationFigures & { since: Date; item: { code: string; name: string; unit: string } };
  const acc = new Map<string, Acc>(); // key: orderId|itemId
  for (const a of allocations) {
    const key = `${a.orderId}|${a.itemId}`;
    const f = acc.get(key) ?? { allocated: 0, issued: 0, since: a.createdAt, item: a.item };
    f.allocated += a.allocatedQty.toNumber();
    if (a.createdAt < f.since) f.since = a.createdAt;
    acc.set(key, f);
  }
  for (const i of issues) {
    const f = acc.get(`${i.sourceId}|${i.itemId}`);
    if (f && i.createdAt >= f.since) f.issued += -i.changeQty.toNumber();
  }
  const out: Record<string, OrderAllocationRow[]> = {};
  for (const [key, f] of acc) {
    const [orderId, itemId] = key.split('|');
    (out[orderId] ??= []).push({ itemId, ...f.item, allocated: f.allocated, issued: f.issued, remaining: remainingAllocation(f) });
  }
  for (const rows of Object.values(out)) rows.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** What the order screen shows: every item earmarked for the order, with what is left to issue. */
export async function getOrderAllocations(orderId: string): Promise<OrderAllocationRow[]> {
  await requirePermission('orders.read');
  const allocations = await db.misOrderStockAllocation.findMany({
    where: { orderId },
    select: { itemId: true, item: { select: { code: true, name: true, unit: true } } },
    distinct: ['itemId'],
  });
  if (allocations.length === 0) return [];
  const figures = await allocationFigures(db, orderId, allocations.map((a) => a.itemId));
  return allocations
    .map((a) => {
      const f = figures.get(a.itemId) ?? { allocated: 0, issued: 0 };
      return { itemId: a.itemId, ...a.item, allocated: f.allocated, issued: f.issued, remaining: remainingAllocation(f) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
