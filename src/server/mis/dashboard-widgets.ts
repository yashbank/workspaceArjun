/**
 * R2-411..414: the data behind the opt-in dashboard widgets (low stock, inward PO fulfilment,
 * BOM pipeline). The scrap-rate trend lives with the other range widgets in `range-metrics.ts`.
 *
 * Read-only, counts and quantities only, never a rate, price or value (D24). Every export opens
 * with its own gate and returns a plain JSON-safe shape: numbers and strings, no Decimal, no Date.
 */

import { factoryDateKey } from '@/lib/mis/factory-time';
import { factoryRangeFromKeys } from '@/lib/mis/report-range';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type LowStockAlerts = {
  /** Every active item with a reorder level whose balance is at or below it. */
  count: number;
  /** The five furthest below their level (balance as a share of the level, lowest first). */
  top: { id: string; code: string; name: string; unit: string; balance: number; reorderLevel: number }[];
};

/** Items at or below their reorder level. The balance is the ledger's last row per item, the same source as the store balances. */
export async function getLowStockAlerts(): Promise<LowStockAlerts> {
  await requirePermission('inventory.read');
  const items = await db.misItem.findMany({
    where: { isActive: true, deletedAt: null, reorderLevel: { gt: 0 } },
    select: { id: true, code: true, name: true, unit: true, reorderLevel: true },
  });
  if (items.length === 0) return { count: 0, top: [] };

  const ledger = await db.$queryRaw<{ item_id: string; balance_qty: unknown }[]>`
    SELECT DISTINCT ON (item_id) item_id, balance_qty
    FROM mis_inventory_ledger
    ORDER BY item_id, created_at DESC
  `;
  const balanceOf = new Map(ledger.map((r) => [r.item_id, Number(r.balance_qty)]));

  const low = items
    .map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      balance: round2(balanceOf.get(i.id) ?? 0),
      reorderLevel: round2(Number(i.reorderLevel)),
    }))
    .filter((i) => i.balance <= i.reorderLevel)
    .sort((a, b) => a.balance / a.reorderLevel - b.balance / b.reorderLevel || a.name.localeCompare(b.name));

  return { count: low.length, top: low.slice(0, 5) };
}

export type PoFulfilment = {
  /** POs approved and still expecting goods (approved, receiving or part-received). */
  pending: number;
  /** Of those, the ones past their promised delivery date. */
  overdue: number;
  /** Distinct POs with a confirmed GRN received this calendar month (factory time). */
  receivedThisMonth: number;
  grnsThisMonth: number;
  monthLabel: string;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Inward purchase orders: still pending against received this month. Counts only. */
export async function getPoFulfilment(): Promise<PoFulfilment> {
  await requirePermission('po.read');
  await requirePermission('grn.read');
  const timeZone = await getFactoryTimezone();
  const today = factoryDateKey(new Date(), timeZone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const next = Number(today.slice(5, 7)) === 12 ? `${Number(today.slice(0, 4)) + 1}-01-01` : `${today.slice(0, 4)}-${String(Number(today.slice(5, 7)) + 1).padStart(2, '0')}-01`;
  const { from, to } = factoryRangeFromKeys(monthStart, next, timeZone);

  const [open, grns] = await Promise.all([
    db.misPurchaseOrder.findMany({
      where: { status: { in: ['APPROVED', 'RECEIVING', 'PARTIAL'] } },
      select: { deliveryDueDate: true },
    }),
    db.misGrn.findMany({
      where: { status: 'CONFIRMED', receivedAt: { gte: from, lt: to } },
      select: { poId: true },
    }),
  ]);

  return {
    pending: open.length,
    // deliveryDueDate is a calendar date stored at UTC midnight, so its key compares with today's directly.
    overdue: open.filter((p) => p.deliveryDueDate && p.deliveryDueDate.toISOString().slice(0, 10) < today).length,
    receivedThisMonth: new Set(grns.map((g) => g.poId)).size,
    grnsThisMonth: grns.length,
    monthLabel: MONTHS[Number(today.slice(5, 7)) - 1],
  };
}

export type BomPipeline = { noBom: number; draft: number; pendingApproval: number };

const ACTIVE_ORDER = { status: { notIn: ['CANCELLED', 'DELIVERED'] } };

/** Open orders by BOM stage: no BOM yet, a draft BOM, a BOM waiting for approval. The same "open" as the BOM list's tab counts. */
export async function getBomPipeline(): Promise<BomPipeline> {
  await requirePermission('orders.read'); // bom.ts gates every BOM read on orders.read; there is no bom.read action
  const [noBom, draft, pendingApproval] = await Promise.all([
    db.misOrder.count({ where: { ...ACTIVE_ORDER, bom: null } }),
    db.misOrder.count({ where: { ...ACTIVE_ORDER, bom: { status: 'DRAFT' } } }),
    db.misOrder.count({ where: { ...ACTIVE_ORDER, bom: { status: 'PENDING_APPROVAL' } } }),
  ]);
  return { noBom, draft, pendingApproval };
}
