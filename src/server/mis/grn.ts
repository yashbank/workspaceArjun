import { shortQuantity, withoutInvoiceMoney } from '@/lib/mis/grn-match';
import { matchSupplierInvoice } from '@/lib/mis/invoice-match';
import { orderNumberFromRef } from '@/lib/mis/order-allocation';
import { roundQty } from '@/lib/mis/quantity';
import type { MisRoleName } from '@/lib/mis/roles';
import { can } from '@/lib/mis/permissions';
import { withoutMoneyFields } from '@/lib/mis/money-fields';
import { db } from '@/server/db';
import { MisForbiddenError, requirePermission } from './auth';
import { logAuditEvent } from './audit';
import { allocateFromReceipt } from './order-allocation';
import { notifyGrnConfirmed } from './grn-alerts';
import { itemLockKey, poItemLockKey } from '@/lib/mis/stock-lock-keys';
import { lockStockKeys } from './stock-lock';

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

/** A GRN refused because of what state it is in (already confirmed, empty, not a draft). */
export class GrnStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GrnStateError';
  }
}

type Decimalish = { toNumber(): number } | number | null | undefined;
const num = (v: Decimalish): number => (v == null ? 0 : typeof v === 'number' ? v : v.toNumber());

/** A line's three quantities, rounded to the stored 2 dp BEFORE any rule looks at them. */
function lineQuantities(received: number, dc: number | null | undefined, damage: number | null | undefined) {
  for (const v of [received, dc ?? 0, damage ?? 0]) {
    if (!Number.isFinite(v)) throw new Error('Enter a valid quantity.');
  }
  const out = { received: roundQty(received), dc: dc == null ? null : roundQty(dc), damage: roundQty(damage ?? 0) };
  if (out.received < 0 || out.damage < 0 || (out.dc ?? 0) < 0) throw new Error('Quantities cannot be negative.');
  if (out.received + out.damage <= 0) throw new Error('A line needs a received or damaged quantity above zero.');
  return out;
}

/** The PO line may take `received` more: ordered minus what confirmed GRNs already booked, minus the rest of this GRN. */
function assertWithinOutstanding(poLine: { quantity: Decimalish; receivedQuantity: Decimalish }, received: number, alongside: number) {
  const ordered = num(poLine.quantity);
  const outstanding = roundQty(ordered - num(poLine.receivedQuantity));
  const room = Math.max(0, roundQty(outstanding - alongside));
  if (roundQty(received + alongside) > outstanding) {
    throw new Error(`Cannot receive ${received}: only ${room} of the ${ordered} ordered is still outstanding on this PO line.`);
  }
}

type EditableGrn = {
  id: string;
  status: string;
  po: { items: { id: string; quantity: Decimalish; receivedQuantity: Decimalish }[] };
  items: { id: string; poItemId: string; receivedQty: Decimalish }[];
};

/** The GRN a line is being added to or changed on: must exist and still be a DRAFT. */
async function loadDraftGrn(grnId: string): Promise<EditableGrn> {
  const grn = (await db.misGrn.findUnique({
    where: { id: grnId },
    include: {
      po: { select: { items: { select: { id: true, quantity: true, receivedQuantity: true } } } },
      items: { select: { id: true, poItemId: true, receivedQty: true } },
    },
  })) as EditableGrn | null;
  if (!grn) throw new Error(`GRN ${grnId} not found`);
  if (grn.status !== 'DRAFT') throw new GrnStateError('A confirmed GRN cannot be edited.');
  return grn;
}

/** The PO line must be one of THIS GRN's purchase order. */
function poLineOf(grn: EditableGrn, poItemId: string) {
  const line = grn.po.items.find((p) => p.id === poItemId);
  if (!line) throw new Error("That line is not on this GRN's purchase order.");
  return line;
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
  const q = lineQuantities(input.receivedQty, input.dcQuantity, input.damageQuantity);
  const grn = await loadDraftGrn(grnId);
  const poLine = poLineOf(grn, input.poItemId);
  const alongside = roundQty(grn.items.filter((i) => i.poItemId === input.poItemId).reduce((sum, i) => sum + num(i.receivedQty), 0));
  assertWithinOutstanding(poLine, q.received, alongside);
  const created = await db.misGrnItem.create({
    data: {
      grnId,
      poItemId: input.poItemId,
      receivedQty: q.received,
      type: input.type || 'GENERAL',
      forOrderRef: input.forOrderRef?.trim() || null,
      batchNo: input.batchNo?.trim() || null,
      notes: input.notes?.trim() || null,
      dcQuantity: q.dc,
      damageQuantity: q.damage,
      shortQuantity: shortQuantity(q.dc, q.received, q.damage),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'grn_item.create', entity: 'MisGrnItem', entityId: created.id, after: created });
  return created;
}

export async function updateGRNItem(id: string, patch: Partial<GrnItemInput>) {
  const actor = await requirePermission('grn.write');
  const before = await db.misGrnItem.findUnique({ where: { id } });
  if (!before) throw new Error(`GRN Item ${id} not found`);
  const grn = await loadDraftGrn(before.grnId);
  const poItemId = patch.poItemId ?? before.poItemId;
  const poLine = poLineOf(grn, poItemId);
  const q = lineQuantities(
    patch.receivedQty !== undefined ? patch.receivedQty : before.receivedQty.toNumber(),
    patch.dcQuantity !== undefined ? patch.dcQuantity : before.dcQuantity?.toNumber() ?? null,
    patch.damageQuantity !== undefined ? patch.damageQuantity : before.damageQuantity.toNumber(),
  );
  const alongside = roundQty(grn.items.filter((i) => i.poItemId === poItemId && i.id !== id).reduce((sum, i) => sum + num(i.receivedQty), 0));
  assertWithinOutstanding(poLine, q.received, alongside);
  const after = await db.misGrnItem.update({ where: { id }, data: {
    ...(patch.poItemId !== undefined ? { poItemId: patch.poItemId } : {}),
    ...(patch.receivedQty !== undefined ? { receivedQty: q.received } : {}),
    ...(patch.dcQuantity !== undefined ? { dcQuantity: q.dc } : {}),
    ...(patch.damageQuantity !== undefined ? { damageQuantity: q.damage } : {}),
    shortQuantity: shortQuantity(q.dc, q.received, q.damage),
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
  if (grn.status === 'CONFIRMED') throw new GrnStateError('GRN already confirmed');
  // A delivery with nothing on it is not a delivery: at least one line must carry a quantity.
  if (!grn.items.some((i) => i.receivedQty.toNumber() + num(i.damageQuantity) > 0)) {
    throw new GrnStateError('Add at least one item with a received or damaged quantity before confirming.');
  }

  // Confirm GRN and update inventory in one transaction
  await db.$transaction(async (tx) => {
    // Serialise with every other writer of these items' ledgers and these PO lines' counters, so
    // the cap below is checked on figures nobody else can change until we commit.
    await lockStockKeys(tx, [
      ...grn.items.flatMap((i) => (i.poItem.itemId ? [itemLockKey(i.poItem.itemId)] : [])),
      ...grn.items.map((i) => poItemLockKey(i.poItemId)),
    ]);

    // The DRAFT -> CONFIRMED flip is the claim. Checked in the same statement that writes it, so of
    // two concurrent confirms exactly one gets count 1; the loser writes nothing.
    const claimed = await tx.misGrn.updateMany({
      where: { id: grnId, status: 'DRAFT' },
      data: { status: 'CONFIRMED', receivedAt: new Date(), receivedById: actor.userId },
    });
    if (claimed.count !== 1) throw new GrnStateError('GRN already confirmed');

    // Another GRN may have been confirmed since these lines were typed: re-check the cap on fresh figures.
    const poLines = await tx.misPoItem.findMany({
      where: { id: { in: grn.items.map((i) => i.poItemId) } },
      select: { id: true, quantity: true, receivedQuantity: true },
    });
    for (const poLine of poLines) {
      const here = roundQty(grn.items.filter((i) => i.poItemId === poLine.id).reduce((sum, i) => sum + i.receivedQty.toNumber(), 0));
      assertWithinOutstanding(poLine, here, 0);
    }

    // V2 Epic 1: the invoice named on the header becomes the third leg of the 3-way match.
    if (grn.supplierInvoiceNo) {
      // A later GRN naming the same invoice without a date/amount must not blank the Owner's figures.
      const { status } = matchSupplierInvoice(
        grn.items.map((i) => ({ receivedQty: i.receivedQty.toNumber(), ratePerUnit: i.poItem.ratePerUnit.toNumber(), dcQuantity: i.dcQuantity?.toNumber() ?? null })),
        grn.supplierInvoiceAmount?.toNumber() ?? null,
      );
      const known = {
        ...(grn.invoiceDate ? { invoiceDate: grn.invoiceDate } : {}),
        ...(grn.supplierInvoiceAmount !== null ? { invoiceAmount: grn.supplierInvoiceAmount, status } : {}),
      };
      await tx.misSupplierInvoice.upsert({
        where: { poId_invoiceNo: { poId: grn.poId, invoiceNo: grn.supplierInvoiceNo } },
        create: { poId: grn.poId, invoiceNo: grn.supplierInvoiceNo, grnId, supplierId: grn.po.supplierId, status, ...known },
        update: { grnId, supplierId: grn.po.supplierId, ...known },
      });
    }

    for (const grnItem of grn.items) {
      if (grnItem.receivedQty.toNumber() <= 0) continue; // damage-only line: nothing good arrived
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
