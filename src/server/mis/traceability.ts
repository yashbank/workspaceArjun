import { withoutRates } from '@/lib/mis/bom-costing';
import { sumByUnit } from '@/lib/mis/qty-by-unit';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { withCheckerNames } from '@/server/mis/qc';
import { withUploaderNames } from '@/server/mis/documents';

/** Full traceability for one order: BOM → production → QC → documents */
export async function getOrderTrace(orderId: string) {
  const actor = await requirePermission('orders.read');

  const [order, bom, productionLogs, qcChecks, documents] = await Promise.all([
    db.misOrder.findUnique({
      where: { id: orderId },
      include: { customer: { select: { name: true } } },
    }),
    db.misBom.findUnique({
      where: { orderId },
      include: {
        stages: {
          include: {
            process: { select: { name: true } },
            materials: { include: { item: { select: { name: true, unit: true } } }, orderBy: { seq: 'asc' } },
          },
          orderBy: { seq: 'asc' },
        },
      },
    }),
    db.misProductionLog.findMany({
      where: { orderId, voidedAt: null },
      include: {
        machine: { select: { name: true } },
        employee: { select: { name: true } },
        shift: { select: { name: true } },
      },
      orderBy: { loggedAt: 'asc' },
    }),
    db.misQcCheck.findMany({
      where: { orderId, voidedAt: null },
      orderBy: { checkTime: 'asc' },
    }).then(withCheckerNames),
    db.misDocument.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    }).then(withUploaderNames).catch(() => []),
  ]);

  // Purchasing and store legs (#35). Each needs its own permission, so a role that may not open the
  // PO / GRN / store screens (QC, D6) is not handed their contents through the trace. Quantities only:
  // no rate, price or invoice amount is selected at all.
  const orderNumber = order?.orderNumber ?? null;
  const [purchaseOrders, issuedMaterials] = await Promise.all([
    orderNumber && can(actor.role, 'po.read')
      ? loadPurchaseOrders(orderNumber, can(actor.role, 'grn.read'))
      : Promise.resolve(null),
    orderNumber && can(actor.role, 'store.read') ? loadIssuedMaterials(orderId, orderNumber) : Promise.resolve(null),
  ]);

  // R2-290: never add 1,000 SHEETS to 10,000 PIECES. Per-unit totals are the truth; the flat totals
  // are kept for one-unit orders only and are null when units are mixed.
  const producedBy = sumByUnit(productionLogs.map((l) => ({ qty: Number(l.qtyProduced), unit: l.unit })));
  const wasteBy = sumByUnit(productionLogs.map((l) => ({ qty: Number(l.qtyWaste ?? 0), unit: l.unit })));
  const byUnit = producedBy.map((p) => ({ unit: p.unit, produced: p.qty, waste: wasteBy.find((w) => w.unit === p.unit)?.qty ?? 0 }));
  const totalProduced = byUnit.length === 1 ? byUnit[0].produced : null;
  const totalWaste = byUnit.length === 1 ? byUnit[0].waste : null;
  const passChecks = qcChecks.filter((q) => q.result === 'PASS').length;
  const failChecks = qcChecks.filter((q) => q.result === 'FAIL').length;

  // Material rates are money (D24, F-06): the trace carries the BOM structure, not what it cost.
  const visibleBom = bom && !can(actor.role, 'wages.read') ? withoutRates(bom) : bom;

  return {
    order, bom: visibleBom, productionLogs, qcChecks, documents, totalProduced, totalWaste, byUnit, passChecks, failChecks,
    // null = this role may not see that leg; [] = it may, and there is nothing behind it.
    purchaseOrders, issuedMaterials,
  };
}

export type TraceGrn = {
  grnNumber: string;
  status: string;
  receivedAt: Date | null;
  lines: { itemName: string; unit: string | null; receivedQty: number }[];
};
export type TracePo = {
  poNumber: string;
  status: string;
  supplierName: string | null;
  /** null when the role may read POs but not GRNs. */
  grns: TraceGrn[] | null;
};
export type TraceIssuedMaterial = { itemName: string; unit: string; qty: number; issuedAt: Date };

/** POs raised against this order (their BOM ref IS the order number), with their GRNs. No money is selected. */
async function loadPurchaseOrders(orderNumber: string, withGrns: boolean): Promise<TracePo[]> {
  const pos = await db.misPurchaseOrder.findMany({
    where: { bomRef: orderNumber },
    orderBy: { createdAt: 'asc' },
    select: {
      poNumber: true,
      status: true,
      supplier: { select: { name: true } },
      grns: {
        orderBy: { createdAt: 'asc' },
        select: {
          grnNumber: true,
          status: true,
          receivedAt: true,
          items: { select: { receivedQty: true, poItem: { select: { description: true, item: { select: { name: true, unit: true } } } } } },
        },
      },
    },
  });
  return pos.map((po) => ({
    poNumber: po.poNumber,
    status: po.status,
    supplierName: po.supplier?.name ?? null,
    grns: withGrns
      ? po.grns.map((g) => ({
          grnNumber: g.grnNumber,
          status: g.status,
          receivedAt: g.receivedAt,
          lines: g.items.map((i) => ({ itemName: i.poItem.item?.name ?? i.poItem.description, unit: i.poItem.item?.unit ?? null, receivedQty: Number(i.receivedQty) })),
        }))
      : null,
  }));
}

/**
 * What the store issued to this order. The inventory ledger is authoritative (`STORE_ISSUE` rows keyed by
 * the order id); the storekeeper's book (`OUT` rows keyed by the order number) is added only for issues the
 * ledger does not already account for, so one issue is never listed twice. Quantities only.
 */
async function loadIssuedMaterials(orderId: string, orderNumber: string): Promise<TraceIssuedMaterial[]> {
  const [ledger, txns] = await Promise.all([
    db.misInventoryLedger.findMany({
      where: { source: 'STORE_ISSUE', sourceId: orderId },
      orderBy: { createdAt: 'asc' },
      select: { itemId: true, changeQty: true, createdAt: true, item: { select: { name: true, unit: true } } },
    }),
    db.misStoreTransaction.findMany({
      where: { type: 'OUT', referenceNo: orderNumber },
      orderBy: { createdAt: 'asc' },
      select: { itemId: true, quantity: true, createdAt: true, item: { select: { name: true, unit: true } } },
    }),
  ]);
  const out: TraceIssuedMaterial[] = ledger.map((l) => ({ itemName: l.item.name, unit: l.item.unit, qty: Math.abs(Number(l.changeQty)), issuedAt: l.createdAt }));
  const claimed = new Set<number>();
  const unmatched: TraceIssuedMaterial[] = [];
  for (const t of txns) {
    const qty = Math.abs(Number(t.quantity));
    const i = ledger.findIndex((l, idx) => !claimed.has(idx) && l.itemId === t.itemId && Math.abs(Math.abs(Number(l.changeQty)) - qty) < 0.005);
    if (i >= 0) claimed.add(i);
    else unmatched.push({ itemName: t.item.name, unit: t.item.unit, qty, issuedAt: t.createdAt });
  }
  return [...out, ...unmatched].sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
}
