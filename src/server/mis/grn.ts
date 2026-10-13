import { DEFAULT_FACTORY_TIMEZONE, factoryDateKey } from '@/lib/mis/factory-time';
import { shortQuantity, withoutInvoiceMoney } from '@/lib/mis/grn-match';
import { matchSupplierInvoice } from '@/lib/mis/invoice-match';
import { orderNumberFromRef } from '@/lib/mis/order-allocation';
import { roundQty } from '@/lib/mis/quantity';
import {
  isReceivablePoStatus,
  mayOverrideReceipt,
  overReceiptMessage,
  poNotReceivableMessage,
  poStatusAfterReceipt,
  receiptVerdict,
  type ReceiptVerdict,
} from '@/lib/mis/receipt-rules';
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
import { lastLedgerBalance, lastTxnBalance, nextTxnSeq, round2, storeFactoryZone, STXN_SEQ_KEY, txnNumberOf } from './store-books';

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
  /** R3-STK B03 — an ADMIN/OWNER's reason for taking more than the order + 2%. Ignored for anyone else. */
  overReceiptReason?: string | null;
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

/** A PO line as the cap rule needs it. `description`/`item` only make the refusal readable. */
type PoLineInfo = {
  id: string;
  quantity: Decimalish;
  receivedQuantity: Decimalish;
  description?: string | null;
  item?: { name?: string | null; unit?: string | null } | null;
};

const lineLabel = (l: PoLineInfo) => l.item?.name ?? l.description ?? 'This line';

/**
 * R3-STK B03 — may this PO line take `qty` more? Within ordered + 2% is open to any `grn.write` holder; beyond it
 * only an ADMIN/OWNER with a reason (>= 3 characters). `role` comes from `requirePermission`, never from the client.
 * Returns the verdict so a caller can audit an override; throws the sentence the storekeeper reads when refused.
 */
export function enforceReceiptCap(
  role: MisRoleName,
  poLine: PoLineInfo,
  qty: number,
  alongside: number,
  overReceiptReason?: string | null,
): ReceiptVerdict {
  const verdict = receiptVerdict({
    ordered: num(poLine.quantity),
    receivedSoFar: num(poLine.receivedQuantity),
    alreadyOnThisGrn: alongside,
    qty,
    role,
    overReceiptReason,
  });
  if (verdict.kind === 'REFUSED') {
    throw new GrnStateError(overReceiptMessage(lineLabel(poLine), verdict.max, poLine.item?.unit ?? '', mayOverrideReceipt(role)));
  }
  return verdict;
}

/** The PO must still be open for goods (approved or part-received). */
export function assertPoReceivable(po: { poNumber?: string | null; status?: string | null }) {
  if (!isReceivablePoStatus(po.status)) throw new GrnStateError(poNotReceivableMessage(po.poNumber ?? '', po.status));
}

const NO_LONGER_DRAFT = 'GRN is no longer a draft';

type EditableGrn = {
  id: string;
  status: string;
  po: { items: PoLineInfo[] };
  items: { id: string; poItemId: string; receivedQty: Decimalish }[];
};

/** The GRN a line is being added to or changed on: must exist and still be a DRAFT. */
async function loadDraftGrn(grnId: string): Promise<EditableGrn> {
  const grn = (await db.misGrn.findUnique({
    where: { id: grnId },
    include: {
      po: { select: { items: { select: { id: true, quantity: true, receivedQuantity: true, description: true, item: { select: { name: true, unit: true } } } } } },
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

/**
 * `GRN-YYYYMM-NNNNN`, the month being the FACTORY's month. `attempt` offsets the suffix on a retry (as
 * `nextPoNumber` does), so a collision does not need the clock to tick first.
 */
export function nextGrnNumber(attempt = 0, zone: string = DEFAULT_FACTORY_TIMEZONE, now: Date = new Date()): string {
  const month = factoryDateKey(now, zone).slice(0, 7).replace('-', '');
  const suffix = String(now.getTime() + attempt * 7919 + Math.floor(Math.random() * 97)).slice(-5);
  return `GRN-${month}-${suffix}`;
}

export const GRN_NUMBER_ATTEMPTS = 5;

/** A clash on the GRN number (the only unique column a new GRN can clash on). */
export function isGrnNumberClash(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } } | null;
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (target === undefined) return true;
  return String(Array.isArray(target) ? target.join(',') : target).includes('grn_number');
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
  const po = await db.misPurchaseOrder.findUnique({ where: { id: input.poId }, select: { poNumber: true, status: true } });
  if (!po) throw new Error('That purchase order no longer exists.');
  assertPoReceivable(po);
  const data = headerData(actor.role, input, 'create');
  const zone = await storeFactoryZone();
  let created;
  for (let attempt = 0; ; attempt += 1) {
    try {
      created = await db.misGrn.create({
        data: { grnNumber: nextGrnNumber(attempt, zone), poId: input.poId, notes: input.notes?.trim() || null, ...data },
      });
      break;
    } catch (error) {
      if (!isGrnNumberClash(error) || attempt >= GRN_NUMBER_ATTEMPTS - 1) throw error;
    }
  }
  await logAuditEvent({ actorId: actor.userId, action: 'grn.create', entity: 'MisGrn', entityId: created.id, after: auditSafeHeader(created) });
  return forReader(actor.role, created);
}

/** R3-STK B12 — the same invoice number from this supplier already sits on another PO. Advisory: never blocks. */
async function invoiceWarnings(supplierId: string | null | undefined, invoiceNo: string | null | undefined, poId: string): Promise<string[]> {
  if (!supplierId || !invoiceNo) return [];
  const other = await db.misSupplierInvoice.findFirst({
    where: { supplierId, invoiceNo, poId: { not: poId } },
    select: { po: { select: { poNumber: true } } },
  });
  return other ? [`Invoice ${invoiceNo} is already recorded on PO ${other.po?.poNumber ?? 'another PO'}`] : [];
}

/** V2 Epic 1 — edit the paperwork on a DRAFT GRN. */
export async function updateGRNHeader(id: string, patch: GrnHeaderInput) {
  const actor = await requirePermission('grn.write');
  const found = await db.misGrn.findUnique({ where: { id }, include: { po: { select: { supplierId: true } } } });
  if (!found) throw new Error(`GRN ${id} not found`);
  if (found.status !== 'DRAFT') throw new Error('A confirmed GRN cannot be edited.');
  const { po, ...before } = found;
  // The DRAFT condition rides on the write itself, so a confirm that lands in between cannot be edited under.
  const written = await db.misGrn.updateMany({ where: { id, status: 'DRAFT' }, data: headerData(actor.role, patch, 'patch') });
  if (written.count !== 1) throw new GrnStateError(NO_LONGER_DRAFT);
  const after = await db.misGrn.findUnique({ where: { id } });
  if (!after) throw new Error(`GRN ${id} not found`);
  await logAuditEvent({ actorId: actor.userId, action: 'grn.header.update', entity: 'MisGrn', entityId: id, before: auditSafeHeader(before), after: auditSafeHeader(after) });
  const warnings = await invoiceWarnings(po?.supplierId, after.supplierInvoiceNo, after.poId);
  return { ...forReader(actor.role, after), warnings };
}

export async function addGRNItem(grnId: string, input: GrnItemInput) {
  const actor = await requirePermission('grn.write');
  const q = lineQuantities(input.receivedQty, input.dcQuantity, input.damageQuantity);
  const grn = await loadDraftGrn(grnId);
  const poLine = poLineOf(grn, input.poItemId);
  const alongside = roundQty(grn.items.filter((i) => i.poItemId === input.poItemId).reduce((sum, i) => sum + num(i.receivedQty), 0));
  enforceReceiptCap(actor.role, poLine, q.received, alongside, input.overReceiptReason);
  const created = await db.$transaction(async (tx) => {
    // Touching the header with the DRAFT condition takes its row lock: a confirm that claimed it first makes this fail,
    // and a confirm that comes after waits for this line to commit. Either way no line lands on a confirmed GRN.
    const open = await tx.misGrn.updateMany({ where: { id: grnId, status: 'DRAFT' }, data: { updatedAt: new Date() } });
    if (open.count !== 1) throw new GrnStateError(NO_LONGER_DRAFT);
    return tx.misGrnItem.create({
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
  enforceReceiptCap(actor.role, poLine, q.received, alongside, patch.overReceiptReason);
  const after = await db.$transaction(async (tx) => {
    const open = await tx.misGrn.updateMany({ where: { id: before.grnId, status: 'DRAFT' }, data: { updatedAt: new Date() } });
    if (open.count !== 1) throw new GrnStateError(NO_LONGER_DRAFT);
    return tx.misGrnItem.update({ where: { id }, data: {
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
  });
  await logAuditEvent({ actorId: actor.userId, action: 'grn_item.update', entity: 'MisGrnItem', entityId: id, before, after });
  return after;
}

/** #11 — take a line off a DRAFT GRN. A confirmed GRN's lines are history: refused by `loadDraftGrn`. */
export async function removeGRNItem(id: string) {
  const actor = await requirePermission('grn.write');
  const before = await db.misGrnItem.findUnique({ where: { id } });
  if (!before) throw new Error(`GRN Item ${id} not found`);
  await loadDraftGrn(before.grnId);
  // The status check rides on the delete itself, so a confirm that lands in between cannot lose a line.
  const removed = await db.misGrnItem.deleteMany({ where: { id, grn: { status: 'DRAFT' } } });
  if (removed.count !== 1) throw new GrnStateError('A confirmed GRN cannot be edited.');
  await logAuditEvent({ actorId: actor.userId, action: 'grn_item.delete', entity: 'MisGrnItem', entityId: id, before });
  return { id };
}

/** #13 — throw away a DRAFT GRN (header and lines). Nothing was booked, so nothing is reversed. */
export async function discardGRN(grnId: string) {
  const actor = await requirePermission('grn.write');
  const before = await db.misGrn.findUnique({ where: { id: grnId }, include: { items: { select: { id: true } } } });
  if (!before) throw new Error(`GRN ${grnId} not found`);
  if (before.status !== 'DRAFT') throw new GrnStateError('A confirmed GRN cannot be discarded.');
  await db.$transaction(async (tx) => {
    // Lines first (they reference the header), then the header, both guarded on DRAFT: if a confirm
    // landed in between, the header delete matches nothing, we throw, and the line delete rolls back.
    await tx.misGrnItem.deleteMany({ where: { grnId, grn: { status: 'DRAFT' } } });
    const gone = await tx.misGrn.deleteMany({ where: { id: grnId, status: 'DRAFT' } });
    if (gone.count !== 1) throw new GrnStateError('A confirmed GRN cannot be discarded.');
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'grn.discard',
    entity: 'MisGrn',
    entityId: grnId,
    before: { ...auditSafeHeader(before), items: undefined, lineCount: before.items.length },
  });
  return { id: grnId };
}

type ConfirmLine = {
  poItemId: string;
  receivedQty: { toNumber(): number };
  damageQuantity?: Decimalish;
  poItem: { itemId: string | null; description?: string | null };
};

/** A confirmable GRN has a line with something on it, and every received line lands in the catalog (D4). */
function assertConfirmable(items: readonly ConfirmLine[]) {
  // A delivery with nothing on it is not a delivery: at least one line must carry a quantity.
  if (!items.some((i) => i.receivedQty.toNumber() + num(i.damageQuantity) > 0)) {
    throw new GrnStateError('Add at least one item with a received or damaged quantity before confirming.');
  }
  // D4: a received line must land in the catalog. Name the first offender and write nothing.
  const uncatalogued = items.findIndex((i) => i.receivedQty.toNumber() > 0 && !i.poItem.itemId);
  if (uncatalogued >= 0) {
    const bad = items[uncatalogued];
    throw new GrnStateError(
      `Line ${uncatalogued + 1} ("${bad.poItem.description}") has no catalog item, so its stock cannot be booked. Link the PO line to a catalog item, then confirm again.`,
    );
  }
}

/** One audit row for an over-receipt override: quantities and the reason only, never a rate or an amount. */
export function auditOverReceipt(
  actorId: string,
  grnId: string | null,
  overrides: { poItemId: string; ordered: number; receivedTotal: number; max: number }[],
  reason: string,
): Promise<void> {
  return logAuditEvent({
    actorId,
    action: 'GRN_OVER_RECEIPT_OVERRIDE',
    entity: grnId ? 'MisGrn' : 'MisStoreTransaction',
    entityId: grnId,
    after: { grnId, lines: overrides, reason },
  });
}

export async function confirmGRN(grnId: string, opts: { overReceiptReason?: string | null } = {}) {
  const actor = await requirePermission('grn.write');
  const grn = await db.misGrn.findUnique({ where: { id: grnId }, include: { po: { select: { bomRef: true, supplierId: true } }, items: { include: { poItem: { include: { item: true } } } } } });
  if (!grn) throw new Error(`GRN ${grnId} not found`);
  if (grn.status === 'CONFIRMED') throw new GrnStateError('GRN already confirmed');
  assertConfirmable(grn.items);
  const zone = await storeFactoryZone(); // read before the transaction: the runtime pool is one connection wide

  const lockedItems = new Set(grn.items.flatMap((i) => (i.poItem.itemId ? [i.poItem.itemId] : [])));
  const lockedPoItems = new Set(grn.items.map((i) => i.poItemId));
  const overrides: { poItemId: string; ordered: number; receivedTotal: number; max: number }[] = [];
  let overrideReason = '';

  // Confirm GRN and update inventory in one transaction
  await db.$transaction(async (tx) => {
    // Serialise with every other writer of these items' ledgers, these PO lines' counters and the daily
    // transaction sequence, so the cap below is checked on figures nobody else can change until we commit.
    await lockStockKeys(tx, [...[...lockedItems].map(itemLockKey), ...[...lockedPoItems].map(poItemLockKey), STXN_SEQ_KEY]);

    // The DRAFT -> CONFIRMED flip is the claim. Checked in the same statement that writes it, so of
    // two concurrent confirms exactly one gets count 1; the loser writes nothing.
    const claimed = await tx.misGrn.updateMany({
      where: { id: grnId, status: 'DRAFT' },
      data: { status: 'CONFIRMED', receivedAt: new Date(), receivedById: actor.userId },
    });
    if (claimed.count !== 1) throw new GrnStateError('GRN already confirmed');

    // B04 — book from what is on the GRN NOW, not from the snapshot read before the locks. The claim above means no
    // line can be added or changed from here on, so this read is final.
    const fresh = await tx.misGrn.findUnique({
      where: { id: grnId },
      include: {
        po: {
          select: {
            poNumber: true,
            status: true,
            bomRef: true,
            supplierId: true,
            items: { select: { id: true, quantity: true, receivedQuantity: true, description: true, item: { select: { name: true, unit: true } } } },
          },
        },
        items: { include: { poItem: { include: { item: true } } } },
      },
    });
    if (!fresh) throw new Error(`GRN ${grnId} not found`);
    if (fresh.items.some((i) => !lockedPoItems.has(i.poItemId) || (i.poItem.itemId && !lockedItems.has(i.poItem.itemId)))) {
      throw new GrnStateError('This GRN changed while it was being confirmed. Reload it and confirm again.');
    }
    assertConfirmable(fresh.items);
    // B02 — the PO may have been cancelled since this GRN was drafted. Read after the PO-line locks.
    assertPoReceivable(fresh.po);

    // Another GRN may have been confirmed since these lines were typed: re-check the cap on fresh figures.
    const received = new Map<string, number>();
    for (const i of fresh.items) received.set(i.poItemId, roundQty((received.get(i.poItemId) ?? 0) + i.receivedQty.toNumber()));
    for (const poLine of fresh.po.items) {
      const here = received.get(poLine.id);
      if (here === undefined) continue;
      const verdict = enforceReceiptCap(actor.role, poLine, here, 0, opts.overReceiptReason);
      if (verdict.kind === 'OVERRIDE') {
        overrideReason = verdict.reason;
        overrides.push({ poItemId: poLine.id, ordered: num(poLine.quantity), receivedTotal: verdict.receivedTotal, max: verdict.max });
      }
    }

    // V2 Epic 1: the invoice named on the header becomes the third leg of the 3-way match.
    if (fresh.supplierInvoiceNo) {
      // B10 — an invoice can arrive in several deliveries: match it against ALL confirmed GRNs of this PO that name it.
      const sameInvoice = await tx.misGrn.findMany({
        where: { poId: fresh.poId, status: 'CONFIRMED', supplierInvoiceNo: fresh.supplierInvoiceNo },
        select: { items: { select: { receivedQty: true, dcQuantity: true, poItem: { select: { ratePerUnit: true } } } } },
      });
      const matchItems = (sameInvoice.length > 0 ? sameInvoice.flatMap((g) => g.items) : fresh.items).map((i) => ({
        receivedQty: i.receivedQty.toNumber(),
        ratePerUnit: i.poItem.ratePerUnit.toNumber(),
        dcQuantity: i.dcQuantity?.toNumber() ?? null,
      }));
      // A later GRN naming the same invoice without a date/amount must not blank the Owner's figures.
      const { status } = matchSupplierInvoice(matchItems, fresh.supplierInvoiceAmount?.toNumber() ?? null);
      const known = {
        ...(fresh.invoiceDate ? { invoiceDate: fresh.invoiceDate } : {}),
        ...(fresh.supplierInvoiceAmount !== null ? { invoiceAmount: fresh.supplierInvoiceAmount, status } : {}),
      };
      await tx.misSupplierInvoice.upsert({
        where: { poId_invoiceNo: { poId: fresh.poId, invoiceNo: fresh.supplierInvoiceNo } },
        create: { poId: fresh.poId, invoiceNo: fresh.supplierInvoiceNo, grnId, supplierId: fresh.po.supplierId, status, ...known },
        update: { grnId, supplierId: fresh.po.supplierId, ...known },
      });
    }

    const { prefix, next } = await nextTxnSeq(tx, zone);
    let seq = next;
    for (const grnItem of fresh.items) {
      if (grnItem.receivedQty.toNumber() <= 0) continue; // damage-only line: nothing good arrived
      if (!grnItem.poItem.itemId) continue; // unreachable: refused above (D4)
      const itemId = grnItem.poItem.itemId;

      // Inventory ledger: the authoritative balance.
      const currentBalance = await lastLedgerBalance(tx, itemId);
      const newBalance = round2(currentBalance + grnItem.receivedQty.toNumber());

      await tx.misInventoryLedger.create({
        data: {
          itemId,
          changeQty: grnItem.receivedQty,
          balanceQty: newBalance,
          source: 'GRN',
          sourceId: grnId,
          notes: `GRN ${fresh.grnNumber}`,
        },
      });

      // The storekeeper's IN/OUT book (what /mis/store/stock and /transactions read), exactly as
      // commitReceipt writes it: referenced by the GRN number, so the backfill can tell it is there.
      const txnBalance = await lastTxnBalance(tx, itemId);
      await tx.misStoreTransaction.create({
        data: {
          txnNumber: txnNumberOf(prefix, seq),
          itemId,
          type: 'IN',
          quantity: grnItem.receivedQty,
          balanceQty: round2(txnBalance + grnItem.receivedQty.toNumber()),
          referenceNo: fresh.grnNumber,
          reason: null,
          isOverIssue: false,
          createdById: actor.userId,
        },
      });
      seq += 1;

      // V2 Epic 2: a PO raised against an order (BOM ref = order number) earmarks every line, exactly as
      // the store cart does; a FOR_ORDER line may name a different order with its own ref.
      const ref = grnItem.type === 'FOR_ORDER' && orderNumberFromRef(grnItem.forOrderRef) ? grnItem.forOrderRef : fresh.po.bomRef;
      await allocateFromReceipt(tx, { ref, itemId, qty: grnItem.receivedQty.toNumber(), sourceId: grnId });

      // Update received quantity on PO item
      await tx.misPoItem.update({
        where: { id: grnItem.poItemId },
        data: { receivedQuantity: { increment: grnItem.receivedQty } },
      });
    }

    // B01 — move the PO on, so a fully received order shows Complete and leaves the GRN picker. The figures are the
    // ones read under the lock plus what this GRN just added.
    if (received.size > 0 && [...received.values()].some((q) => q > 0)) {
      const status = poStatusAfterReceipt(
        fresh.po.items.map((l) => ({ quantity: num(l.quantity), receivedQuantity: roundQty(num(l.receivedQuantity) + (received.get(l.id) ?? 0)) })),
      );
      if (status && status !== fresh.po.status) await tx.misPurchaseOrder.update({ where: { id: fresh.poId }, data: { status } });
    }
  });

  await logAuditEvent({ actorId: actor.userId, action: 'grn.confirm', entity: 'MisGrn', entityId: grnId });
  if (overrides.length > 0) await auditOverReceipt(actor.userId, grnId, overrides, overrideReason);
  await notifyGrnConfirmed(grnId); // V2 Epic 4 — the office hears about it now
  const warnings = await invoiceWarnings(grn.po.supplierId, grn.supplierInvoiceNo, grn.poId);
  const confirmed = await db.misGrn.findUnique({ where: { id: grnId } });
  return { ...confirmed, warnings };
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
