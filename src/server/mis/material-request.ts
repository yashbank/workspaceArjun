import { cappedIssueQty, linesRefusedForOrder } from '@/lib/mis/material-request';
import { db } from '@/server/db';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { commitIssue, type CartLineInput } from './store';

/**
 * V2 Epic 3 — Material Issue Notes.
 *
 * A Supervisor raises a note (`store.read`: anyone who can see the store may ask for material —
 * no new permission, so the matrix and its tests are untouched). The Store decides it
 * (`store.write`). Approval is the ONLY path that moves stock, and it moves it through
 * `commitIssue`, so the ledger, the storekeeper's book and the order-allocation cap all apply
 * exactly as they do to a direct issue.
 */

export type MaterialRequestLineInput = { itemId: string; qty: number };
export type MaterialRequestMeta = { orderId?: string | null; departmentId?: string | null; notes?: string | null };

function nextRequestNumber(): string {
  const now = new Date();
  return `MRN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-5)}`;
}

export async function createMaterialRequest(lines: MaterialRequestLineInput[], meta: MaterialRequestMeta = {}) {
  const actor = await requirePermission('store.read');
  if (lines.length === 0) throw new Error('Add at least one item.');
  for (const l of lines) {
    if (!Number.isFinite(l.qty) || l.qty <= 0) throw new Error('Every line needs a quantity greater than zero.');
  }
  const items = await db.misItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) }, isActive: true, deletedAt: null },
    select: { id: true, name: true, category: true },
  });
  if (items.length !== new Set(lines.map((l) => l.itemId)).size) {
    throw new Error('One of the items is no longer active.');
  }
  const refused = linesRefusedForOrder(items, meta.orderId);
  if (refused.length > 0) {
    throw new Error(`Equipment and other items are department overhead and cannot be booked to an order: ${refused.join(', ')}`);
  }
  const created = await db.misMaterialRequest.create({
    data: {
      requestNumber: nextRequestNumber(),
      orderId: meta.orderId ?? null,
      departmentId: meta.departmentId ?? null,
      notes: meta.notes?.trim() || null,
      requestedById: actor.userId,
      lines: { create: lines.map((l) => ({ itemId: l.itemId, requestedQty: l.qty })) },
    },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'material_request.create',
    entity: 'MisMaterialRequest',
    entityId: created.id,
    after: { requestNumber: created.requestNumber, orderId: created.orderId, departmentId: created.departmentId, lineCount: lines.length },
  });
  return created;
}

const LIST_INCLUDE = {
  order: { select: { id: true, orderNumber: true } },
  department: { select: { id: true, name: true } },
  lines: { include: { item: { select: { id: true, code: true, name: true, unit: true, category: true } } } },
} as const;

export async function listMaterialRequests() {
  await requirePermission('store.read');
  return db.misMaterialRequest.findMany({
    include: LIST_INCLUDE,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export async function getMaterialRequest(id: string) {
  await requirePermission('store.read');
  return db.misMaterialRequest.findUnique({ where: { id }, include: LIST_INCLUDE });
}

export type ApproveLineInput = { lineId: string; actualIssuedQty: number };

/**
 * Approve and issue. Each line is capped at what was asked; a line issued at 0 is recorded as
 * such and left out of the cart. The status flips to APPROVED before the stock moves so two
 * storekeepers cannot both issue the same note; if the issue then fails, the flip is undone.
 */
export async function approveMaterialRequest(id: string, decisions: ApproveLineInput[], note?: string | null) {
  const actor = await requirePermission('store.write');
  const req = await db.misMaterialRequest.findUnique({ where: { id }, include: { lines: true } });
  if (!req) throw new Error('Request not found');
  if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status}`);

  const byLine = new Map(decisions.map((d) => [d.lineId, d.actualIssuedQty]));
  const issued = req.lines.map((line) => {
    const actual = cappedIssueQty(line.requestedQty.toNumber(), byLine.get(line.id) ?? 0);
    return { lineId: line.id, itemId: line.itemId, qty: actual };
  });
  const cart: CartLineInput[] = issued.filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, qty: l.qty }));
  if (cart.length === 0) throw new Error('Nothing to issue — set at least one quantity above zero, or reject the request.');

  const claimed = await db.misMaterialRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'APPROVED', decidedById: actor.userId, decidedAt: new Date(), decisionNote: note?.trim() || null },
  });
  if (claimed.count !== 1) throw new Error('Request was decided by someone else just now.');

  try {
    const result = await commitIssue(cart, {
      orderId: req.orderId,
      departmentId: req.departmentId,
      notes: `${req.requestNumber}${note?.trim() ? ` · ${note.trim()}` : ''}`,
    });
    // shortcut: line quantities are written after the ledger commit, not inside it; upgrade to one
    // transaction if commitIssue ever exposes a tx client.
    for (const l of issued) {
      await db.misMaterialRequestLine.update({ where: { id: l.lineId }, data: { actualIssuedQty: l.qty } });
    }
    await logAuditEvent({
      actorId: actor.userId,
      action: 'material_request.approve',
      entity: 'MisMaterialRequest',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: 'APPROVED', reference: result.reference, lineCount: result.lineCount, totalQty: String(result.totalQty) },
    });
    return result;
  } catch (error) {
    await db.misMaterialRequest.updateMany({
      where: { id, status: 'APPROVED' },
      data: { status: 'PENDING', decidedById: null, decidedAt: null, decisionNote: null },
    });
    throw error;
  }
}

export async function rejectMaterialRequest(id: string, reason: string) {
  const actor = await requirePermission('store.write');
  if (!reason?.trim()) throw new Error('A reason is required to reject a request.');
  const claimed = await db.misMaterialRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED', decidedById: actor.userId, decidedAt: new Date(), decisionNote: reason.trim() },
  });
  if (claimed.count !== 1) throw new Error('Request is not pending.');
  await logAuditEvent({
    actorId: actor.userId,
    action: 'material_request.reject',
    entity: 'MisMaterialRequest',
    entityId: id,
    before: { status: 'PENDING' },
    after: { status: 'REJECTED', reason: reason.trim() },
  });
}
