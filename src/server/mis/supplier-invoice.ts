import type { Prisma } from '@/generated/prisma/client';
import { threeWayMatch, type ThreeWayMatch } from '@/lib/mis/grn-match';
import { matchSupplierInvoice, sameInvoiceNo, type MatchStatus } from '@/lib/mis/invoice-match';
import { can } from '@/lib/mis/permissions';
import { pageQuery, parseSearch, type Paged } from '@/lib/mis/pagination';
import { db } from '@/server/db';

import { logAuditEvent } from './audit';
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

// ---------------------------------------------------------------------------------------------
// F6 — the reconciliation board: every supplier invoice with its 3-way match status.
// ---------------------------------------------------------------------------------------------

export type SupplierInvoiceRow = {
  id: string;
  invoiceNo: string;
  invoiceDate: Date | null;
  poNumber: string;
  grnNumber: string | null;
  supplierName: string | null;
  status: MatchStatus;
  /** Admin and Owner (never the Store Guy): quantities and the variance as a percentage. */
  figures?: { billedQty: number | null; receivedQty: number; qtyVariance: number | null; variancePct: number | null };
  /** Owner only (D24): rupee values, formatted on the server. Absent for every other role. */
  money?: { expected: string; invoiced: string | null; variance: string | null };
  /** R2-280: the Owner's variance sign-off on a discrepancy invoice, or null. Visible to every reader (no money in it). */
  signedOff: { at: Date; note: string | null } | null;
};

const grnItemsSelect = { select: { receivedQty: true, dcQuantity: true, poItem: { select: { ratePerUnit: true } } } } as const;

const invoiceInclude = {
  // B10: an invoice can arrive in several deliveries, so the match reads every confirmed GRN of the PO that names it.
  po: { select: { poNumber: true, grns: { where: { status: 'CONFIRMED' }, select: { supplierInvoiceNo: true, items: grnItemsSelect } } } },
  supplier: { select: { name: true } },
  grn: { select: { grnNumber: true, items: grnItemsSelect } },
} as const;

type InvoiceWithGrn = Prisma.MisSupplierInvoiceGetPayload<{ include: typeof invoiceInclude }>;

function matchFor(inv: InvoiceWithGrn) {
  const named = (inv.po.grns ?? []).filter((g) => sameInvoiceNo(g.supplierInvoiceNo, inv.invoiceNo)); // R2-335
  // An older invoice whose GRN header never carried the number still has its one linked GRN.
  const items = named.length > 0 ? named.flatMap((g) => g.items) : (inv.grn?.items ?? []);
  return matchSupplierInvoice(
    items.map((i) => ({ receivedQty: i.receivedQty.toNumber(), ratePerUnit: i.poItem.ratePerUnit.toNumber(), dcQuantity: i.dcQuantity?.toNumber() ?? null })),
    inv.invoiceAmount?.toNumber() ?? null,
  );
}

/**
 * The board. `supplier_invoice.read` (Owner, Admin, Store Guy). The Store Guy gets the status
 * only; Admin adds quantities and the variance %; the Owner adds rupees (D24). Three payloads
 * built from the role, not one payload hidden by the screen.
 */
export async function listSupplierInvoices(filter?: { status?: MatchStatus }): Promise<SupplierInvoiceRow[]> {
  const actor = await requirePermission('supplier_invoice.read');
  const rows = await db.misSupplierInvoice.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: invoiceInclude,
  });
  return rows.map((inv) => invoiceRowFor(actor.role, inv));
}

/**
 * R2-83: one page of invoices (25). `status` and `q` (invoice no., PO, supplier) are applied in the query, and
 * `counts` is per-status over the `q` search so the filter chips stay honest. Same role-shaped payloads as the board.
 */
export async function listSupplierInvoicesPage(
  opts: { status?: MatchStatus; q?: string; page?: number | string } = {},
): Promise<Paged<SupplierInvoiceRow> & { counts: Record<MatchStatus, number> }> {
  const actor = await requirePermission('supplier_invoice.read');
  const q = parseSearch(opts.q);
  const search: Prisma.MisSupplierInvoiceWhereInput = q
    ? {
        OR: [
          { invoiceNo: { contains: q, mode: 'insensitive' } },
          { po: { poNumber: { contains: q, mode: 'insensitive' } } },
          { supplier: { name: { contains: q, mode: 'insensitive' } } },
        ],
      }
    : {};
  const where: Prisma.MisSupplierInvoiceWhereInput = { ...search, ...(opts.status ? { status: opts.status } : {}) };
  const { skip, take } = pageQuery(opts.page);
  const [rows, total, grouped] = await Promise.all([
    db.misSupplierInvoice.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: invoiceInclude }),
    db.misSupplierInvoice.count({ where }),
    db.misSupplierInvoice.groupBy({ by: ['status'], where: search, _count: { _all: true } }),
  ]);
  const counts = { MATCHED: 0, DISCREPANCY_QTY: 0, DISCREPANCY_PRICE: 0, PENDING_REVIEW: 0 } as Record<MatchStatus, number>;
  for (const g of grouped) counts[g.status as MatchStatus] = g._count._all;
  return { rows: rows.map((inv) => invoiceRowFor(actor.role, inv)), total, counts };
}

function invoiceRowFor(role: Parameters<typeof can>[0], inv: InvoiceWithGrn): SupplierInvoiceRow {
  const seesFigures = can(role, 'supplier_invoice.write');
  const seesMoney = can(role, 'wages.read');
  const base: SupplierInvoiceRow = {
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    invoiceDate: inv.invoiceDate,
    poNumber: inv.po.poNumber,
    grnNumber: inv.grn?.grnNumber ?? null,
    supplierName: inv.supplier?.name ?? null,
    status: inv.status,
    signedOff: inv.varianceSignedOffAt ? { at: inv.varianceSignedOffAt, note: inv.varianceSignOffNote ?? null } : null,
  };
  if (!seesFigures) return base;
  const m = matchFor(inv);
  return {
    ...base,
    figures: { billedQty: m.billedQty, receivedQty: m.receivedQty, qtyVariance: m.qtyVariance, variancePct: m.priceVariancePct },
    ...(seesMoney
      ? { money: { expected: formatMoney(m.expectedAmount), invoiced: m.invoiceAmount === null ? null : formatMoney(m.invoiceAmount), variance: m.priceVariance === null ? null : formatMoney(m.priceVariance) } }
      : {}),
  };
}

/**
 * Re-run the match for one invoice and store the result (`supplier_invoice.write`: Owner, Admin).
 * The audit entry carries the status only: no amount, no rate (D24).
 */
export async function reconcileSupplierInvoice(id: string): Promise<{ id: string; status: MatchStatus; changed: boolean }> {
  const actor = await requirePermission('supplier_invoice.write');
  const inv = await db.misSupplierInvoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!inv) throw new Error(`Supplier invoice ${id} not found`);
  const { status } = matchFor(inv);
  if (status === inv.status) return { id, status, changed: false };
  // R2-280: a sign-off was given on the OLD variance; a changed match needs a fresh one.
  await db.misSupplierInvoice.update({ where: { id }, data: { status, varianceSignedOffById: null, varianceSignedOffAt: null, varianceSignOffNote: null } });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'supplier_invoice.reconcile',
    entity: 'MisSupplierInvoice',
    entityId: id,
    before: { status: inv.status },
    after: { status },
  });
  return { id, status, changed: true };
}

/**
 * R2-280: a DISCREPANCY invoice is not to be paid until the Owner has looked at the variance and said so, on the record.
 * Owner only (`wages.read` is the Owner's money gate, D24). The audit row carries the note, never a figure.
 */
export async function signOffInvoiceVariance(id: string, note?: string | null) {
  const actor = await requirePermission('wages.read');
  const inv = await db.misSupplierInvoice.findUnique({ where: { id }, select: { id: true, status: true, varianceSignedOffAt: true } });
  if (!inv) throw new Error(`Supplier invoice ${id} not found`);
  if (inv.status !== 'DISCREPANCY_QTY' && inv.status !== 'DISCREPANCY_PRICE') throw new Error('Only an invoice with a quantity or price discrepancy needs a sign-off.');
  if (inv.varianceSignedOffAt) throw new Error('This variance was already signed off.');
  const trimmed = note?.trim() || null;
  const at = new Date();
  await db.misSupplierInvoice.update({ where: { id }, data: { varianceSignedOffById: actor.userId, varianceSignedOffAt: at, varianceSignOffNote: trimmed } });
  await logAuditEvent({
    actorId: actor.userId, action: 'supplier_invoice.sign_off_variance', entity: 'MisSupplierInvoice', entityId: id,
    before: { status: inv.status, signedOff: false }, after: { status: inv.status, signedOff: true, note: trimmed },
  });
  return { id, signedOff: { at, note: trimmed } };
}
