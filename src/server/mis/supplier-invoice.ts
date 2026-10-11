import { threeWayMatch, type ThreeWayMatch } from '@/lib/mis/grn-match';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';

import { requirePermission } from './auth';
import { formatMoney } from './po';

export type PoReconciliation = Omit<ThreeWayMatch, 'money'> & {
  invoices: { id: string; invoiceNo: string; invoiceDate: Date | null; grnNumber: string | null }[];
  /** Owner only (D24): formatted on the server, absent for everyone else. */
  money?: { poValue: string; receivedValue: string; invoiced: string; variance: string; varianceRaw: number };
};

/**
 * V2 Epic 1 — the 3-way match for one PO: ordered vs received (confirmed GRNs, with damage and
 * short) vs invoiced. Quantities for any `po.read` holder; rupee figures only for `wages.read`.
 */
export async function reconcilePO(poId: string): Promise<PoReconciliation> {
  const actor = await requirePermission('po.read');
  const seesMoney = can(actor.role, 'wages.read');
  const [poItems, grnItems, invoices] = await Promise.all([
    db.misPoItem.findMany({ where: { poId }, orderBy: { sortOrder: 'asc' }, select: { id: true, description: true, quantity: true, ratePerUnit: true } }),
    db.misGrnItem.findMany({
      where: { grn: { poId } },
      select: { poItemId: true, receivedQty: true, damageQuantity: true, shortQuantity: true, grn: { select: { status: true } } },
    }),
    db.misSupplierInvoice.findMany({
      where: { poId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, invoiceNo: true, invoiceDate: true, invoiceAmount: true, grn: { select: { grnNumber: true } } },
    }),
  ]);
  const match = threeWayMatch(
    poItems.map((p) => ({ id: p.id, description: p.description, quantity: p.quantity.toNumber(), ratePerUnit: seesMoney ? p.ratePerUnit.toNumber() : null })),
    grnItems.map((g) => ({
      poItemId: g.poItemId,
      receivedQty: g.receivedQty.toNumber(),
      damageQuantity: g.damageQuantity.toNumber(),
      shortQuantity: g.shortQuantity?.toNumber() ?? null,
      confirmed: g.grn.status === 'CONFIRMED',
    })),
    // A non-Owner's invoices are all 'unpriced' here on purpose: no rate, no amount, no money block.
    invoices.map((i) => ({ invoiceNo: i.invoiceNo, invoiceAmount: seesMoney ? i.invoiceAmount?.toNumber() ?? null : null })),
  );
  const { money, ...rest } = match;
  return {
    ...rest,
    invoices: invoices.map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, invoiceDate: i.invoiceDate, grnNumber: i.grn?.grnNumber ?? null })),
    ...(seesMoney && money
      ? { money: { poValue: formatMoney(money.poValue), receivedValue: formatMoney(money.receivedValue), invoiced: formatMoney(money.invoiced), variance: formatMoney(money.variance), varianceRaw: money.variance } }
      : {}),
  };
}
