import { shortQuantity, withoutInvoiceMoney } from '@/lib/mis/grn-match';
import { orderNumberFromRef } from '@/lib/mis/order-allocation';
import type { MisRoleName } from '@/lib/mis/roles';
import { can } from '@/lib/mis/permissions';
import { withoutMoneyFields } from '@/lib/mis/money-fields';
import { db } from '@/server/db';
import { MisForbiddenError, requirePermission } from './auth';
import { logAuditEvent } from './audit';
import { allocateFromReceipt } from './order-allocation';
import { notifyGrnConfirmed } from './grn-alerts';

/** V2 Epic 1 — the delivery's paperwork. `supplierInvoiceAmount` is money: Owner-only to write and to read. */
export type GrnHeaderInput = {
  supplierInvoiceNo?: string | null;
  /** ISO date `YYYY-MM-DD`. */
  invoiceDate?: string | null;
  supplierInvoiceAmount?: number | null;
  lrNumber?: string | null;
  vehicleNumber?: string | null;
  transporterName?: string | null;
  dcNumber?: string | null;
};
export type GrnInput = { poId: string; notes?: string | null } & GrnHeaderInput;
export type GrnItemInput = {
  poItemId: string;
  receivedQty: number;
  type?: 'GENERAL' | 'FOR_ORDER';
  forOrderRef?: string | null;
  batchNo?: string | null;
  notes?: string | null;
  /** V2 Epic 1 — challan quantity and damaged quantity; `shortQuantity` is derived, never input. */
  dcQuantity?: number | null;
  damageQuantity?: number | null;
};

const text = (v: string | null | undefined) => v?.trim() || null;

/** The header columns from an input. Throws for a non-Owner who sends an amount: money is not theirs to write. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function parseInvoiceDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (!ISO_DATE.test(value) || Number.isNaN(date.getTime())) throw new Error('Invoice date must be a valid date (YYYY-MM-DD).');
  return date;
}

function headerData(role: MisRoleName, input: GrnHeaderInput, mode: 'create' | 'patch') {
  const has = (k: keyof GrnHeaderInput) => mode === 'create' || input[k] !== undefined;
  if (input.supplierInvoiceAmount !== undefined && input.supplierInvoiceAmount !== null && !can(role, 'wages.read')) {
    throw new MisForbiddenError('wages.read', 'supplier invoice amount');
  }
  return {
    ...(has('supplierInvoiceNo') ? { supplierInvoiceNo: text(input.supplierInvoiceNo) } : {}),
    ...(has('invoiceDate') ? { invoiceDate: parseInvoiceDate(input.invoiceDate) } : {}),
    ...(has('supplierInvoiceAmount') && can(role, 'wages.read') ? { supplierInvoiceAmount: input.supplierInvoiceAmount ?? null } : {}),
    ...(has('lrNumber') ? { lrNumber: text(input.lrNumber) } : {}),
    ...(has('vehicleNumber') ? { vehicleNumber: text(input.vehicleNumber) } : {}),
    ...(has('transporterName') ? { transporterName: text(input.transporterName) } : {}),
    ...(has('dcNumber') ? { dcNumber: text(input.dcNumber) } : {}),
  };
}

/** Audit payload for a header: everything but the amount (never audited, D24). */
function auditSafeHeader<T extends { supplierInvoiceAmount?: unknown }>(row: T): Omit<T, 'supplierInvoiceAmount'> {
  const { supplierInvoiceAmount: _amount, ...rest } = row;
  return rest;
}

/** A GRN row (or list) as `role` may read it: invoice money and PO line rates only for `wages.read`. */
function forReader<T>(role: MisRoleName, value: T): T {
  return can(role, 'wages.read') ? value : (withoutInvoiceMoney(withoutMoneyFields(value)) as T);
}

export function nextGrnNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const ms = String(Date.now()).slice(-5);
  return `GRN-${y}${m}-${ms}`;
}

export async function listGRNs() {
  const actor = await requirePermission('grn.read');
  const rows = await db.misGrn.findMany({
    include: {
      po: { select: { id: true, poNumber: true, supplier: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return forReader(actor.role, rows);
}

/** A GRN with its PO. The PO's line rates are money (D24, F-06): absent unless the caller holds `wages.read`. */
export async function getGRN(id: string) {
  const actor = await requirePermission('grn.read');
  const grn = await db.misGrn.findUnique({
    where: { id },
    include: {
      po: {
        include: {
          supplier: true,
          items: { include: { item: { select: { id: true, name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } },
        },
      },
      items: {
        include: { poItem: { include: { item: { select: { id: true, name: true } } } } },
      },
    },
  });
  return grn ? forReader(actor.role, grn) : grn;
}

export async function createGRN(input: GrnInput) {
  const actor = await requirePermission('grn.write');
  const created = await db.misGrn.create({
    data: {
      grnNumber: nextGrnNumber(),
      poId: input.poId,
      notes: input.notes?.trim() || null,
      ...headerData(actor.role, input, 'create'),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'grn.create', entity: 'MisGrn', entityId: created.id, after: auditSafeHeader(created) });
  return forReader(actor.role, created);
}

/** V2 Epic 1 — edit the paperwork on a DRAFT GRN. */
export async function updateGRNHeader(id: string, patch: GrnHeaderInput) {
  const actor = await requirePermission('grn.write');
  const before = await db.misGrn.findUnique({ where: { id } });
  if (!before) throw new Error(`GRN ${id} not found`);
  if (before.status !== 'DRAFT') throw new Error('A confirmed GRN cannot be edited.');
  const after = await db.misGrn.update({ where: { id }, data: headerData(actor.role, patch, 'patch') });
  await logAuditEvent({ actorId: actor.userId, action: 'grn.header.update', entity: 'MisGrn', entityId: id, before: auditSafeHeader(before), after: auditSafeHeader(after) });
  return forReader(actor.role, after);
}

export async function addGRNItem(grnId: string, input: GrnItemInput) {
  const actor = await requirePermission('grn.write');
  const created = await db.misGrnItem.create({
    data: {
      grnId,
      poItemId: input.poItemId,
      receivedQty: input.receivedQty,
      type: input.type || 'GENERAL',
      forOrderRef: input.forOrderRef?.trim() || null,
      batchNo: input.batchNo?.trim() || null,
      notes: input.notes?.trim() || null,
      dcQuantity: input.dcQuantity ?? null,
      damageQuantity: input.damageQuantity ?? 0,
      shortQuantity: shortQuantity(input.dcQuantity, input.receivedQty, input.damageQuantity ?? 0),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'grn_item.create', entity: 'MisGrnItem', entityId: created.id, after: created });
  return created;
}

export async function updateGRNItem(id: string, patch: Partial<GrnItemInput>) {
  const actor = await requirePermission('grn.write');
  const before = await db.misGrnItem.findUnique({ where: { id } });
  if (!before) throw new Error(`GRN Item ${id} not found`);
  const received = patch.receivedQty ?? before.receivedQty.toNumber();
  const dc = patch.dcQuantity !== undefined ? patch.dcQuantity : before.dcQuantity?.toNumber() ?? null;
  const damage = patch.damageQuantity !== undefined ? patch.damageQuantity ?? 0 : before.damageQuantity.toNumber();
  const after = await db.misGrnItem.update({ where: { id }, data: {
    ...(patch.receivedQty !== undefined ? { receivedQty: patch.receivedQty } : {}),
    ...(patch.dcQuantity !== undefined ? { dcQuantity: dc } : {}),
    ...(patch.damageQuantity !== undefined ? { damageQuantity: damage } : {}),
    shortQuantity: shortQuantity(dc, received, damage),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.forOrderRef !== undefined ? { forOrderRef: patch.forOrderRef?.trim() || null } : {}),
    ...(patch.batchNo !== undefined ? { batchNo: patch.batchNo?.trim() || null } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'grn_item.update', entity: 'MisGrnItem', entityId: id, before, after });
  return after;
}

export async function confirmGRN(grnId: string) {
  const actor = await requirePermission('grn.write');
  const grn = await db.misGrn.findUnique({ where: { id: grnId }, include: { po: { select: { bomRef: true, supplierId: true } }, items: { include: { poItem: { include: { item: true } } } } } });
  if (!grn) throw new Error(`GRN ${grnId} not found`);
  if (grn.status === 'CONFIRMED') throw new Error('GRN already confirmed');

  // Confirm GRN and update inventory in one transaction
  await db.$transaction(async (tx) => {
    await tx.misGrn.update({
      where: { id: grnId },
      data: { status: 'CONFIRMED', receivedAt: new Date(), receivedById: actor.userId },
    });

    // V2 Epic 1: the invoice named on the header becomes the third leg of the 3-way match.
    if (grn.supplierInvoiceNo) {
      // A later GRN naming the same invoice without a date/amount must not blank the Owner's figures.
      const known = {
        ...(grn.invoiceDate ? { invoiceDate: grn.invoiceDate } : {}),
        ...(grn.supplierInvoiceAmount !== null ? { invoiceAmount: grn.supplierInvoiceAmount } : {}),
      };
      await tx.misSupplierInvoice.upsert({
        where: { poId_invoiceNo: { poId: grn.poId, invoiceNo: grn.supplierInvoiceNo } },
        create: { poId: grn.poId, invoiceNo: grn.supplierInvoiceNo, grnId, supplierId: grn.po.supplierId, ...known },
        update: { grnId, supplierId: grn.po.supplierId, ...known },
      });
    }

    for (const grnItem of grn.items) {
      if (!grnItem.poItem.itemId) continue;
      const itemId = grnItem.poItem.itemId;

      // Get current balance
      const lastLedger = await tx.misInventoryLedger.findFirst({
        where: { itemId },
        orderBy: { createdAt: 'desc' },
        select: { balanceQty: true },
      });
      const currentBalance = lastLedger?.balanceQty.toNumber() ?? 0;
      const newBalance = currentBalance + grnItem.receivedQty.toNumber();

      await tx.misInventoryLedger.create({
        data: {
          itemId,
          changeQty: grnItem.receivedQty,
          balanceQty: newBalance,
          source: 'GRN',
          sourceId: grnId,
          notes: `GRN ${grn.grnNumber}`,
        },
      });

      // V2 Epic 2: a PO raised against an order (BOM ref = order number) earmarks every line, exactly as
      // the store cart does; a FOR_ORDER line may name a different order with its own ref.
      const ref = grnItem.type === 'FOR_ORDER' && orderNumberFromRef(grnItem.forOrderRef) ? grnItem.forOrderRef : grn.po.bomRef;
      await allocateFromReceipt(tx, { ref, itemId, qty: grnItem.receivedQty.toNumber(), sourceId: grnId });

      // Update received quantity on PO item
      await tx.misPoItem.update({
        where: { id: grnItem.poItemId },
        data: { receivedQuantity: { increment: grnItem.receivedQty } },
      });
    }
  });

  await logAuditEvent({ actorId: actor.userId, action: 'grn.confirm', entity: 'MisGrn', entityId: grnId });
  await notifyGrnConfirmed(grnId); // V2 Epic 4 — the office hears about it now
  return db.misGrn.findUnique({ where: { id: grnId } });
}

/** GRNs raised but not yet entered against their PO. Count, plus the oldest few. */
export async function listOpenGRNs(limit = 5) {
  await requirePermission('grn.read');
  const where = { status: 'DRAFT' } as const;
  const [total, rows] = await Promise.all([
    db.misGrn.count({ where }),
    db.misGrn.findMany({
      where,
      include: { po: { select: { poNumber: true, supplier: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
  ]);
  return {
    total,
    rows: rows.map((g) => ({
      id: g.id,
      grnNumber: g.grnNumber,
      poNumber: g.po?.poNumber ?? '—',
      supplierName: g.po?.supplier?.name ?? null,
      createdAt: g.createdAt,
    })),
  };
}
