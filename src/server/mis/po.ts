import { Prisma } from '@/generated/prisma/client';
import { can } from '@/lib/mis/permissions';
import { forRole, withoutMoneyFields } from '@/lib/mis/money-fields';
import { pageQuery, parseSearch, type Paged } from '@/lib/mis/pagination';
import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

import { poPurpose, poPurposeLabel, type PoPurpose } from '@/lib/mis/po-purpose';
import { orderNumberFromRef } from '@/lib/mis/order-allocation';
import { BomNotApprovedError } from '@/lib/mis/po-errors';
import { getPoApprovalThreshold } from './business-rules';
import type { MisPoApprovalMode } from '@/generated/prisma/enums';

// The purpose helpers are pure and shared with the client screens, so they live
// in `lib/`. Re-exported here so server callers still reach them off `po.ts`.
export { poPurpose, poPurposeLabel, type PoPurpose };

export type PoInput = {
  supplierId?: string | null;
  /** Omit to infer from `bomRef` — kept so older callers still work. */
  purpose?: PoPurpose;
  bomRef?: string | null;
  notes?: string | null;
};

export type PoItemInput = {
  itemId?: string | null;
  description: string;
  quantity: number;
  unitId?: string | null;
  ratePerUnit: number;
};

/**
 * `attempt` (MIS-111's same finding, F-38, applied here too — `orders.ts`'s `nextOrderNumber`
 * had the identical bug). Two `createPO` calls in the same millisecond derive the identical
 * number and the second write throws the `poNumber` unique-constraint violation; `attempt`
 * offsets the number on each retry so a collision does not need the clock to tick first.
 */
function nextPoNumber(attempt = 0): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const ms = String(Date.now() + attempt * 7919 + Math.floor(Math.random() * 97)).slice(-5);
  return `PO-${y}${m}-${ms}`;
}

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002');
}

/** Format a Decimal or number as Indian currency string, server-side. */
export function formatMoney(value: Prisma.Decimal | number): string {
  const num = typeof value === 'number' ? value : value.toNumber();
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(num);
}

/** Internal only — never exported. Used by computePoTotal (gated) and submitForApproval
 * (which decides approvalMode from the number but never returns it to the caller). */
async function sumPoItems(poId: string): Promise<number> {
  const items = await db.misPoItem.findMany({ where: { poId } });
  return items.reduce((sum, item) => sum + item.quantity.toNumber() * item.ratePerUnit.toNumber(), 0);
}

/** True when the PO has at least one line with a quantity above zero (#6). */
async function hasBillableLine(poId: string): Promise<boolean> {
  const items = await db.misPoItem.findMany({ where: { poId } });
  return items.some((item) => item.quantity.toNumber() > 0);
}

/**
 * A PO's total. It IS money (D24, F-06), so it is `wages.read` — the Owner's — and a caller without
 * it is refused, exactly like `getBomCosting`. A page that shows POs to other roles must not call it.
 */
export async function computePoTotal(poId: string): Promise<string> {
  await requirePermission('wages.read');
  const total = await sumPoItems(poId);
  return formatMoney(total);
}

export type PoListOptions = { q?: string; page?: number | string };

/** R2-83: one page of POs (25), `q` matches the PO number or the supplier name; `total` counts every match. */
export async function listPOsPage(opts: PoListOptions = {}): Promise<Paged<Awaited<ReturnType<typeof listPOs>>[number]>> {
  await requirePermission('po.view');
  const q = parseSearch(opts.q);
  const where: Prisma.MisPurchaseOrderWhereInput = q
    ? { OR: [{ poNumber: { contains: q, mode: 'insensitive' } }, { supplier: { name: { contains: q, mode: 'insensitive' } } }] }
    : {};
  const { skip, take } = pageQuery(opts.page);
  const [rows, total] = await Promise.all([
    db.misPurchaseOrder.findMany({
      where,
      include: { supplier: { select: { id: true, name: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    db.misPurchaseOrder.count({ where }),
  ]);
  return { rows, total };
}

export async function listPOs() {
  await requirePermission('po.view');
  return db.misPurchaseOrder.findMany({
    include: {
      supplier: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * A PO with its lines. `ratePerUnit` is money (D24, F-06): for a role without `wages.read` the key is
 * REMOVED from every line, so the quantities and receipts still show and the price does not.
 */
export async function getPO(id: string) {
  const actor = await requirePermission('po.view');
  const po = await db.misPurchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: { include: { item: { select: { id: true, name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } },
      grns: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!po) return po;
  // R2-37: a view-only reader (QC: po.view without po.read) sees who the supplier is, never their
  // contact, GST or payment terms — supplier data stays behind po.read.
  const scoped = can(actor.role, 'po.read') ? po : { ...po, supplier: (po.supplier ? { id: po.supplier.id, code: po.supplier.code, name: po.supplier.name } : null) as typeof po.supplier };
  return !can(actor.role, 'wages.read') ? withoutMoneyFields(scoped) : scoped;
}

/**
 * The ONE purpose/bomRef rule, shared by `createPO` and `updatePO`: a buffer-stock PO answers to no
 * BOM (any reference typed before the raiser switched paths is dropped), and a FOR_ORDER PO needs
 * a reference that names an order whose BOM is APPROVED (D1). No FK: the value stays the
 * order-number string.
 */
async function resolvePurposeAndRef(input: { purpose?: PoPurpose; bomRef?: string | null }): Promise<{ purpose: PoPurpose; bomRef: string | null }> {
  const trimmedBomRef = input.bomRef?.trim() || null;
  const purpose: PoPurpose = input.purpose ?? (trimmedBomRef ? 'FOR_ORDER' : 'BUFFER_STOCK');
  // A buffer-stock PO answers to no BOM, so any reference typed before the
  // raiser switched paths is dropped rather than left to mislead a reader.
  if (purpose === 'BUFFER_STOCK') return { purpose, bomRef: null };
  if (!trimmedBomRef) {
    throw new Error('A PO raised from a BOM needs the BOM reference. For a stock top-up, raise it as buffer stock instead.');
  }
  const orderNumber = orderNumberFromRef(trimmedBomRef);
  const order = orderNumber
    ? await db.misOrder.findUnique({ where: { orderNumber }, select: { orderNumber: true, bom: { select: { status: true } } } })
    : null;
  if (!order || order.bom?.status !== 'APPROVED') throw new BomNotApprovedError(orderNumber ?? trimmedBomRef);
  return { purpose, bomRef: order.orderNumber };
}

/** Orders whose BOM is APPROVED — what the BOM Ref picker offers (D1/#8). Plain data, no money. */
export async function listApprovedBomOrders(): Promise<{ orderNumber: string; customerName: string | null; label: string }[]> {
  await requirePermission('po.read');
  const boms = await db.misBom.findMany({
    where: { status: 'APPROVED' },
    select: { order: { select: { orderNumber: true, customer: { select: { name: true } } } } },
    orderBy: { updatedAt: 'desc' },
  });
  return boms.flatMap((b) =>
    b.order
      ? [{ orderNumber: b.order.orderNumber, customerName: b.order.customer?.name ?? null, label: b.order.customer?.name ? `${b.order.orderNumber} · ${b.order.customer.name}` : b.order.orderNumber }]
      : [],
  );
}

async function loadPo(poId: string) {
  const po = await db.misPurchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new Error(`PO ${poId} not found`);
  return po;
}

const statusWords = (status: string) => status.toLowerCase().replace(/_/g, ' ');

const STALE_PO = 'This PO was changed by someone else. Refresh and try again.';

/**
 * Compare-and-set (R3-MST B28): the status transitions write with the status they read in the `where`,
 * so two people acting at once cannot both win. Prisma raises P2025 when no row matches; that becomes
 * the friendly refusal.
 */
async function casWrite<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2025') throw new Error(STALE_PO);
    throw err;
  }
}

/** Quantity: finite, above zero, rounded to 2 dp (R3-MST B26). */
function cleanQuantity(q: unknown): number {
  const n = typeof q === 'number' ? q : Number.NaN;
  const rounded = Math.round(n * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0) throw new Error('Quantity must be a number above zero.');
  return rounded;
}

function cleanDescription(d: unknown): string {
  const t = typeof d === 'string' ? d.trim() : '';
  if (!t) throw new Error('Description is required.');
  return t;
}

/** A line's item, when given, must be a live catalogue item (R3-MST B26). */
async function requireLiveItem(itemId: string | null | undefined) {
  if (!itemId) return;
  const item = await db.misItem.findFirst({ where: { id: itemId, isActive: true, deletedAt: null }, select: { id: true } });
  if (!item) throw new Error('That item is inactive or has been deleted. Pick another item.');
}

/** Lines can only change while the PO is a draft; afterwards the approved paperwork is frozen. */
async function requireDraftPo(poId: string, what: string) {
  const po = await loadPo(poId);
  if (po.status !== 'DRAFT') throw new Error(`This PO is ${statusWords(po.status)}, not a draft — ${what} is only possible on a draft PO.`);
  return po;
}

export async function createPO(input: PoInput) {
  const actor = await requirePermission('po.write');
  // R2-69: a PO is a commercial contract — it cannot exist without a vendor.
  if (!input.supplierId?.trim()) throw new Error('Please select a supplier.');
  const { purpose, bomRef } = await resolvePurposeAndRef(input);
  let created;
  const MAX_ATTEMPTS = 6;
  for (let attempt = 0; ; attempt++) {
    try {
      created = await db.misPurchaseOrder.create({
        data: {
          poNumber: nextPoNumber(attempt),
          supplierId: input.supplierId,
          bomRef,
          // `purpose` is a real column (Phase 21, D1) behind
          // `mis_purchase_orders_purpose_bom_ref_ck`, which requires it to agree with `bomRef` on
          // every row. The column's own Prisma default is FOR_ORDER, so leaving this out would
          // insert a mismatched row for every buffer-stock PO and the database would refuse it —
          // this write is what keeps the two in step, not the default.
          purpose,
          notes: input.notes?.trim() || null,
          createdById: actor.userId,
        },
      });
      break;
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
      // A collided PO number is a clock coincidence (MIS-111's finding, same root cause as
      // orders.ts), not a programming error — propose another one and try again.
    }
  }
  await logAuditEvent({ actorId: actor.userId, action: 'po.create', entity: 'MisPurchaseOrder', entityId: created.id, after: created });
  return created;
}

export async function addPOItem(poId: string, input: PoItemInput) {
  const actor = await requirePermission('po.write');
  await requireDraftPo(poId, 'adding a line');
  const description = cleanDescription(input.description);
  const quantity = cleanQuantity(input.quantity);
  await requireLiveItem(input.itemId);
  // D5: a purchase rate is the Owner's (`wages.read`). Anyone else's value is ignored: the line is stored
  // unpriced (0; the column is NOT NULL) and the Owner prices it at approval.
  const rate = can(actor.role, 'wages.read') ? Number(input.ratePerUnit) || 0 : 0;
  const last = await db.misPoItem.findFirst({ where: { poId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const created = await db.misPoItem.create({
    data: {
      poId,
      itemId: input.itemId || null,
      description,
      quantity,
      unitId: input.unitId || null,
      ratePerUnit: rate,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'po_item.create', entity: 'MisPoItem', entityId: created.id, after: created });
  return forRole(actor.role, created);
}

export async function updatePOItem(id: string, patch: Partial<PoItemInput>) {
  const actor = await requirePermission('po.write');
  const before = await db.misPoItem.findUnique({ where: { id } });
  if (!before) throw new Error(`PO Item ${id} not found`);
  await requireDraftPo(before.poId, 'editing a line');
  const description = patch.description !== undefined ? cleanDescription(patch.description) : undefined;
  const quantity = patch.quantity !== undefined ? cleanQuantity(patch.quantity) : undefined;
  if (patch.itemId) await requireLiveItem(patch.itemId);
  // A non-Owner's rate is ignored: the stored rate is left unchanged.
  const mayPrice = can(actor.role, 'wages.read');
  const after = await db.misPoItem.update({ where: { id }, data: {
    ...(description !== undefined ? { description } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
    ...(mayPrice && patch.ratePerUnit !== undefined ? { ratePerUnit: patch.ratePerUnit } : {}),
    ...(patch.itemId !== undefined ? { itemId: patch.itemId || null } : {}),
    ...(patch.unitId !== undefined ? { unitId: patch.unitId || null } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'po_item.update', entity: 'MisPoItem', entityId: id, before, after });
  return forRole(actor.role, after);
}

/**
 * The Owner prices a line while the PO awaits approval (R3-MST follow-up). Rate only: quantity, item and
 * description are untouched. `wages.read` is the Owner's permission, so no other role gets here.
 */
export async function setPoLineRate(id: string, ratePerUnit: number) {
  const actor = await requirePermission('wages.read');
  if (!Number.isFinite(ratePerUnit) || ratePerUnit <= 0) throw new Error('Rate must be a number above zero.');
  const before = await db.misPoItem.findUnique({ where: { id } });
  if (!before) throw new Error(`PO Item ${id} not found`);
  const po = await loadPo(before.poId);
  if (po.status !== 'PENDING_APPROVAL') throw new Error(`This PO is ${statusWords(po.status)}; rates can only be set while it awaits approval.`);
  const after = await db.misPoItem.update({ where: { id }, data: { ratePerUnit: Math.round(ratePerUnit * 100) / 100 } });
  await logAuditEvent({ actorId: actor.userId, action: 'po_item.set_rate', entity: 'MisPoItem', entityId: id, before, after });
  return forRole(actor.role, after);
}

export async function removePOItem(id: string) {
  const actor = await requirePermission('po.write');
  const existing = await db.misPoItem.findUnique({ where: { id } });
  if (!existing) throw new Error(`PO Item ${id} not found`);
  await requireDraftPo(existing.poId, 'removing a line');
  const deleted = await db.misPoItem.delete({ where: { id } });
  await logAuditEvent({ actorId: actor.userId, action: 'po_item.delete', entity: 'MisPoItem', entityId: id, before: deleted });
  return forRole(actor.role, deleted);
}

/**
 * Decides and freezes the PO's approval chain (D2, D34). The total is computed internally
 * and never returned — only its position relative to `PO_APPROVAL_THRESHOLD` matters. Purpose
 * is never read here: a buffer-stock PO and an order-linked PO of the same value take the
 * SAME path (D2's own acceptance check). `forceOwnerOnly` is D34's manual override — an Owner
 * choosing to keep a sensitive PO to themselves — never derived automatically.
 */
export async function submitForApproval(poId: string, opts: { forceOwnerOnly?: boolean } = {}) {
  const actor = await requirePermission('po.write');
  const before = await db.misPurchaseOrder.findUnique({ where: { id: poId } });
  if (!before) throw new Error(`PO ${poId} not found`);
  if (before.status !== 'DRAFT') throw new Error(`This PO is ${statusWords(before.status)}, not a draft — there is nothing to submit.`);
  if (!(await hasBillableLine(poId))) throw new Error('Add at least one line item (with a quantity) before submitting this PO.');
  // R3-MST B27: a PO needs a supplier and an item on every line. The message names the first offender.
  if (!before.supplierId) throw new Error('Choose a supplier before submitting this PO.');
  const lines = await db.misPoItem.findMany({ where: { poId }, orderBy: { sortOrder: 'asc' } });
  const noItem = lines.findIndex((l) => !l.itemId);
  if (noItem >= 0) throw new Error(`Line ${noItem + 1} ("${lines[noItem].description}") has no item. Pick an item from the catalogue on every line.`);
  let approvalMode: MisPoApprovalMode;
  if (opts.forceOwnerOnly) {
    if (actor.role !== 'OWNER') throw new Error('Only the owner can force a PO to owner-only approval.');
    approvalMode = 'OWNER_ONLY';
  } else {
    const total = await sumPoItems(poId);
    const threshold = await getPoApprovalThreshold();
    // An unpriced line (rate 0: an Admin cannot price) cannot be judged against the threshold, so the
    // Owner must sign and price it: BOTH (R3-MST B26).
    const unpriced = lines.some((l) => l.ratePerUnit.toNumber() <= 0);
    approvalMode = unpriced || total >= threshold ? 'BOTH' : 'ADMIN_ONLY';
  }
  const after = await casWrite(() => db.misPurchaseOrder.update({ where: { id: poId, status: 'DRAFT' }, data: { status: 'PENDING_APPROVAL', approvalMode } }));
  await logAuditEvent({ actorId: actor.userId, action: 'po.submit', entity: 'MisPurchaseOrder', entityId: poId, before, after });
  return after;
}

/**
 * Mode-aware (D2, D34). `ADMIN_ONLY`/`OWNER_ONLY` are one role-checked step straight to
 * `APPROVED`. `BOTH` is two: an Admin (or Owner) records `adminApprovedAt` first, then
 * specifically the Owner gives the final sign-off — the existing `approvedById`/`approvedAt`
 * stay the FINAL approval for every mode, so nothing downstream that already reads them needs
 * to change.
 */
export async function approvePO(poId: string) {
  const actor = await requirePermission('po.write');
  const before = await db.misPurchaseOrder.findUnique({ where: { id: poId } });
  if (!before) throw new Error(`PO ${poId} not found`);
  if (before.status !== 'PENDING_APPROVAL') throw new Error(`PO ${poId} is not pending approval`);
  if (!(await hasBillableLine(poId))) throw new Error('This PO has no line items, so there is nothing to approve.');

  if (before.approvalMode === 'BOTH' && !before.adminApprovedAt) {
    // po.write is held only by ADMIN and OWNER, so whoever got past requirePermission above
    // may give this first step — no extra role check needed.
    const after = await casWrite(() => db.misPurchaseOrder.update({
      where: { id: poId, status: 'PENDING_APPROVAL', adminApprovedAt: null },
      data: { adminApprovedById: actor.userId, adminApprovedAt: new Date() },
    }));
    await logAuditEvent({ actorId: actor.userId, action: 'po.approve_admin_step', entity: 'MisPurchaseOrder', entityId: poId, before, after });
    return after;
  }

  // ADMIN_ONLY needs no further check for the same reason. OWNER_ONLY and BOTH's second step
  // narrow past po.write to exclude an Admin specifically.
  if (before.approvalMode === 'OWNER_ONLY' && actor.role !== 'OWNER') {
    throw new Error('Only the owner can approve this PO.');
  }
  if (before.approvalMode === 'BOTH' && actor.role !== 'OWNER') {
    throw new Error('Only the owner can give the final approval on this PO.');
  }
  // An unpriced line (rate 0) cannot be approved: the Owner sets the rates first (setPoLineRate).
  const unpricedCount = (await db.misPoItem.findMany({ where: { poId } })).filter((l) => l.ratePerUnit.toNumber() <= 0).length;
  if (unpricedCount > 0) throw new Error(`Set rates on ${unpricedCount} unpriced line${unpricedCount === 1 ? '' : 's'} first.`);
  const after = await casWrite(() => db.misPurchaseOrder.update({
    where: { id: poId, status: 'PENDING_APPROVAL' },
    data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: new Date() },
  }));
  await logAuditEvent({ actorId: actor.userId, action: 'po.approve', entity: 'MisPurchaseOrder', entityId: poId, before, after });
  return after;
}

export async function cancelPO(poId: string) {
  const actor = await requirePermission('po.write');
  // The GRN check and the status write share one transaction, so a receipt cannot land in between.
  const { before, after } = await casWrite(() => db.$transaction(async (tx) => {
    const current = await tx.misPurchaseOrder.findUnique({ where: { id: poId } });
    if (!current) throw new Error(`PO ${poId} not found`);
    if (current.status === 'APPROVED') {
      if ((await tx.misGrn.count({ where: { poId } })) > 0) {
        throw new Error('This PO already has a goods receipt (GRN), so it can no longer be cancelled.');
      }
    } else if (current.status !== 'DRAFT' && current.status !== 'PENDING_APPROVAL') {
      throw new Error(`This PO is ${statusWords(current.status)} and cannot be cancelled.`);
    }
    const updated = await tx.misPurchaseOrder.update({ where: { id: poId, status: current.status }, data: { status: 'CANCELLED' } });
    return { before: current, after: updated };
  }));
  await logAuditEvent({ actorId: actor.userId, action: 'po.cancel', entity: 'MisPurchaseOrder', entityId: poId, before, after });
  return after;
}

/** #5 — a DRAFT PO that was never submitted can be removed outright, lines and all. */
export async function deleteDraftPO(poId: string) {
  const actor = await requirePermission('po.write');
  const before = await requireDraftPo(poId, 'deleting');
  await db.$transaction([
    db.misPoItem.deleteMany({ where: { poId } }),
    db.misPurchaseOrder.delete({ where: { id: poId } }),
  ]);
  await logAuditEvent({ actorId: actor.userId, action: 'po.delete', entity: 'MisPurchaseOrder', entityId: poId, before });
}

/**
 * #4 — header edit on a DRAFT PO: supplier, purpose, BOM ref, notes. Fields left `undefined` keep
 * their value. The purpose/bomRef rule (including D1's approved-BOM check) is `createPO`'s, exactly.
 */
export async function updatePO(poId: string, input: PoInput) {
  const actor = await requirePermission('po.write');
  const before = await requireDraftPo(poId, 'editing the details');
  const { purpose, bomRef } = await resolvePurposeAndRef({
    purpose: input.purpose ?? (input.bomRef !== undefined ? undefined : poPurpose(before)),
    bomRef: input.bomRef !== undefined ? input.bomRef : before.bomRef,
  });
  const after = await casWrite(() => db.misPurchaseOrder.update({
    where: { id: poId, status: 'DRAFT' },
    data: {
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId || null } : {}),
      purpose,
      bomRef,
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    },
  }));
  await logAuditEvent({ actorId: actor.userId, action: 'po.update', entity: 'MisPurchaseOrder', entityId: poId, before, after });
  return after;
}
