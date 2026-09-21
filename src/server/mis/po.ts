import { Prisma } from '@/generated/prisma/client';
import { can } from '@/lib/mis/permissions';
import { forRole, withoutMoneyFields } from '@/lib/mis/money-fields';
import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

import { poPurpose, poPurposeLabel, type PoPurpose } from '@/lib/mis/po-purpose';

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

function nextPoNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const ms = String(Date.now()).slice(-5);
  return `PO-${y}${m}-${ms}`;
}

/** Format a Decimal or number as Indian currency string, server-side. */
export function formatMoney(value: Prisma.Decimal | number): string {
  const num = typeof value === 'number' ? value : value.toNumber();
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(num);
}

/**
 * A PO's total. It IS money (D24, F-06), so it is `wages.read` — the Owner's — and a caller without
 * it is refused, exactly like `getBomCosting`. A page that shows POs to other roles must not call it.
 */
export async function computePoTotal(poId: string): Promise<string> {
  await requirePermission('wages.read');
  const items = await db.misPoItem.findMany({ where: { poId } });
  const total = items.reduce((sum, item) => {
    return sum + item.quantity.toNumber() * item.ratePerUnit.toNumber();
  }, 0);
  return formatMoney(total);
}

export async function listPOs() {
  await requirePermission('po.read');
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
  const actor = await requirePermission('po.read');
  const po = await db.misPurchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: { include: { item: { select: { id: true, name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } },
      grns: { orderBy: { createdAt: 'desc' } },
    },
  });
  return po && !can(actor.role, 'wages.read') ? withoutMoneyFields(po) : po;
}

export async function createPO(input: PoInput) {
  const actor = await requirePermission('po.write');
  const trimmedBomRef = input.bomRef?.trim() || null;
  const purpose: PoPurpose = input.purpose ?? (trimmedBomRef ? 'FOR_ORDER' : 'BUFFER_STOCK');
  // A buffer-stock PO answers to no BOM, so any reference typed before the
  // raiser switched paths is dropped rather than left to mislead a reader.
  const bomRef = purpose === 'BUFFER_STOCK' ? null : trimmedBomRef;
  if (purpose === 'FOR_ORDER' && !bomRef) {
    throw new Error('A PO raised from a BOM needs the BOM reference. For a stock top-up, raise it as buffer stock instead.');
  }
  const created = await db.misPurchaseOrder.create({
    data: {
      poNumber: nextPoNumber(),
      supplierId: input.supplierId || null,
      bomRef,
      notes: input.notes?.trim() || null,
      createdById: actor.userId,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'po.create', entity: 'MisPurchaseOrder', entityId: created.id, after: created });
  return created;
}

export async function addPOItem(poId: string, input: PoItemInput) {
  const actor = await requirePermission('po.write');
  const last = await db.misPoItem.findFirst({ where: { poId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const created = await db.misPoItem.create({
    data: {
      poId,
      itemId: input.itemId || null,
      description: input.description.trim(),
      quantity: input.quantity,
      unitId: input.unitId || null,
      ratePerUnit: input.ratePerUnit,
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
  const after = await db.misPoItem.update({ where: { id }, data: {
    ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
    ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
    ...(patch.ratePerUnit !== undefined ? { ratePerUnit: patch.ratePerUnit } : {}),
    ...(patch.itemId !== undefined ? { itemId: patch.itemId || null } : {}),
    ...(patch.unitId !== undefined ? { unitId: patch.unitId || null } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'po_item.update', entity: 'MisPoItem', entityId: id, before, after });
  return forRole(actor.role, after);
}

export async function removePOItem(id: string) {
  const actor = await requirePermission('po.write');
  const deleted = await db.misPoItem.delete({ where: { id } });
  await logAuditEvent({ actorId: actor.userId, action: 'po_item.delete', entity: 'MisPoItem', entityId: id, before: deleted });
  return forRole(actor.role, deleted);
}

export async function submitForApproval(poId: string) {
  const actor = await requirePermission('po.write');
  const before = await db.misPurchaseOrder.findUnique({ where: { id: poId } });
  if (!before) throw new Error(`PO ${poId} not found`);
  const after = await db.misPurchaseOrder.update({ where: { id: poId }, data: { status: 'PENDING_APPROVAL' } });
  await logAuditEvent({ actorId: actor.userId, action: 'po.submit', entity: 'MisPurchaseOrder', entityId: poId, before, after });
  return after;
}

export async function approvePO(poId: string) {
  const actor = await requirePermission('po.write');
  const before = await db.misPurchaseOrder.findUnique({ where: { id: poId } });
  if (!before) throw new Error(`PO ${poId} not found`);
  const after = await db.misPurchaseOrder.update({
    where: { id: poId },
    data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: new Date() },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'po.approve', entity: 'MisPurchaseOrder', entityId: poId, before, after });
  return after;
}

export async function cancelPO(poId: string) {
  const actor = await requirePermission('po.write');
  const before = await db.misPurchaseOrder.findUnique({ where: { id: poId } });
  if (!before) throw new Error(`PO ${poId} not found`);
  const after = await db.misPurchaseOrder.update({ where: { id: poId }, data: { status: 'CANCELLED' } });
  await logAuditEvent({ actorId: actor.userId, action: 'po.cancel', entity: 'MisPurchaseOrder', entityId: poId, before, after });
  return after;
}
