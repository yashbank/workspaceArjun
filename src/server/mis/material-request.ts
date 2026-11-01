import { resolveGeneralUse, storedGeneralInput as generalOf, type GeneralUse, type GeneralUseInput } from '@/lib/mis/general-use';
import { ISSUE_TARGET_REQUIRED } from '@/lib/mis/issue-target';
import { cappedIssueQty, categoryRefusal } from '@/lib/mis/material-request';
import { isOrderClosed } from '@/lib/mis/order-status';
import { positiveQty, roundQty } from '@/lib/mis/quantity';
import { db } from '@/server/db';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { NOTIFICATION_TYPES } from '@/lib/mis/notification-copy';
import { notifyRoles } from './notifications';
import { isUniqueConstraintError } from './orders';
import { commitIssue, type CartLineInput } from './store';
import { notifyGeneralUse, notifyRequestDecided } from './store-notices';

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
export type MaterialRequestMeta = {
  orderId?: string | null;
  departmentId?: string | null;
  notes?: string | null;
  /** R2-80/62/Q11 — required when there is no order: "General / factory use" with a reason and a cost centre. */
  general?: GeneralUseInput;
};


/** `attempt` offsets the clock-derived suffix on a unique-constraint retry (same shape as orders.ts#nextOrderNumber). */
function nextRequestNumber(attempt = 0): string {
  const now = new Date();
  const ms = String(Date.now() + attempt * 7919 + Math.floor(Math.random() * 97)).slice(-5);
  return `MRN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${ms}`;
}


export async function createMaterialRequest(lines: MaterialRequestLineInput[], meta: MaterialRequestMeta = {}) {
  const actor = await requirePermission('store.read');
  if (lines.length === 0) throw new Error('Add at least one item.');
  // Round to the stored 2 dp BEFORE validating, so 0.004 is refused instead of saved as 0.00.
  lines = lines.map((l) => ({ itemId: l.itemId, qty: positiveQty(l.qty) }));
  const items = await db.misItem.findMany({
    where: { id: { in: lines.map((l) => l.itemId) }, isActive: true, deletedAt: null },
    select: { id: true, name: true, category: true },
  });
  if (items.length !== new Set(lines.map((l) => l.itemId)).size) {
    throw new Error('One of the items is no longer active.');
  }
  if (!meta.orderId && !meta.departmentId && !meta.general) throw new Error(ISSUE_TARGET_REQUIRED);
  const generalUse = resolveGeneralUse(meta.orderId, meta.general);
  const [order, department] = await Promise.all([
    meta.orderId ? db.misOrder.findUnique({ where: { id: meta.orderId }, select: { id: true, orderNumber: true, status: true } }) : Promise.resolve(null),
    meta.departmentId ? db.misDepartment.findUnique({ where: { id: meta.departmentId }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  if (meta.orderId && !order) throw new Error('That order no longer exists — reload and pick again.');
  if (meta.departmentId && !department) throw new Error('That department no longer exists — reload and pick again.');
  if (order?.status && isOrderClosed(order.status)) {
    throw new Error(`${order.orderNumber} is ${order.status.toLowerCase().replace(/_/g, ' ')} — material cannot be requested against a closed order.`);
  }
  // Same rule commitIssue enforces at approval: overhead never goes to an order, and needs a department otherwise.
  const refusal = categoryRefusal(items, { orderId: meta.orderId, departmentId: meta.departmentId });
  if (refusal) throw new Error(refusal);
  let created;
  for (let attempt = 0; ; attempt++) {
    try {
      created = await db.misMaterialRequest.create({
        data: {
          requestNumber: nextRequestNumber(attempt),
          orderId: meta.orderId ?? null,
          departmentId: meta.departmentId ?? null,
          isGeneral: generalUse.isGeneral,
          generalReason: generalUse.generalReason,
          costCenter: generalUse.costCenter,
          notes: meta.notes?.trim() || null,
          requestedById: actor.userId,
          lines: { create: lines.map((l) => ({ itemId: l.itemId, requestedQty: l.qty })) },
        },
      });
      break;
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt >= 5) throw err;
    }
  }
  await logAuditEvent({
    actorId: actor.userId,
    action: 'material_request.create',
    entity: 'MisMaterialRequest',
    entityId: created.id,
    after: { requestNumber: created.requestNumber, orderId: created.orderId, departmentId: created.departmentId, lineCount: lines.length, isGeneral: generalUse.isGeneral, chargedTo: generalUse.costCenter, generalReason: generalUse.generalReason },
  });
  // V2 — the Store hears about it now. D7: Admin and Owner hear too (both hold store.write), so a note
  // is never stuck waiting for an absent Store Guy. Best-effort (notifyRoles never throws), after the write.
  await notifyRoles(['STORE_GUY', 'ADMIN', 'OWNER'],NOTIFICATION_TYPES.requestRaised, {
    requestId: created.id,
    requestNumber: created.requestNumber,
    lineCount: lines.length,
    orderNumber: order?.orderNumber ?? null,
    departmentName: department?.name ?? null,
  }, actor.userId);
  // R2-80: a General / factory-use request (no order) tells Owner + Admin when it is raised.
  await notifyGeneralUse(actor.userId, generalUse, { reference: created.requestNumber, kind: 'request', requestId: created.id });
  return created;
}

function generalFromRow(req: { orderId?: string | null; isGeneral?: boolean | null; generalReason?: string | null; costCenter?: string | null }): GeneralUse {
  const g = generalOf(req);
  return resolveGeneralUse(req.orderId, g);
}

const LIST_INCLUDE = {
  order: { select: { id: true, orderNumber: true } },
  department: { select: { id: true, name: true } },
  pickList: { select: { id: true, status: true } },
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

/** For the Store home: how many notes are waiting for a decision. */
export async function countPendingMaterialRequests(): Promise<number> {
  await requirePermission('store.read');
  return db.misMaterialRequest.count({ where: { status: 'PENDING' } });
}

export async function getMaterialRequest(id: string) {
  await requirePermission('store.read');
  return db.misMaterialRequest.findUnique({ where: { id }, include: LIST_INCLUDE });
}

export type ApproveLineInput = { lineId: string; actualIssuedQty: number };

/**
 * Approve and issue. Each line is capped at what was asked; a line issued at 0 is recorded as
 * such and left out of the cart. The status flips to APPROVED inside the issue's own transaction, so two
 * storekeepers cannot both issue the same note and a failed issue claims nothing.
 */
export async function approveMaterialRequest(id: string, decisions: ApproveLineInput[], note?: string | null) {
  const actor = await requirePermission('store.write');
  const req = await db.misMaterialRequest.findUnique({ where: { id }, include: { lines: true } });
  if (!req) throw new Error('Request not found');
  if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status}`);

  const byLine = new Map(decisions.map((d) => [d.lineId, d.actualIssuedQty]));
  const issued = req.lines.map((line) => {
    const actual = cappedIssueQty(line.requestedQty.toNumber(), roundQty(Number(byLine.get(line.id) ?? 0)));
    return { lineId: line.id, itemId: line.itemId, qty: actual };
  });
  const cart: CartLineInput[] = issued.filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, qty: l.qty }));
  if (cart.length === 0) throw new Error('Nothing to issue — set at least one quantity above zero, or reject the request.');
  // R2-286: issuing less than asked keeps the balance open as PARTIALLY_ISSUED; the Store issues the rest later.
  const partial = req.lines.some((line) => (issued.find((l) => l.lineId === line.id)?.qty ?? 0) < line.requestedQty.toNumber());
  const nextStatus = partial ? 'PARTIALLY_ISSUED' : 'APPROVED';

  // B20 — the PENDING -> APPROVED claim, the stock movement and the per-line quantities are ONE transaction (the issue's
  // own). If the issue fails (short stock, a closed order) nothing is claimed: the note stays PENDING and no audit row
  // is written. Two storekeepers racing for one note: the second claim finds it decided, throws, and rolls its issue back.
  const result = await commitIssue(cart, {
    orderId: req.orderId,
    departmentId: req.departmentId,
    general: generalOf(req),
    materialRequestId: id,
    skipGeneralNotice: true, // the approval below raises its own notice, carrying the request link
    notes: `${req.requestNumber}${note?.trim() ? ` · ${note.trim()}` : ''}`,
    inTransaction: async (tx) => {
      const claimed = await tx.misMaterialRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: nextStatus, decidedById: actor.userId, decidedAt: new Date(), decisionNote: note?.trim() || null },
      });
      if (claimed.count !== 1) throw new Error('Request was decided by someone else just now.');
      for (const l of issued) {
        await tx.misMaterialRequestLine.update({ where: { id: l.lineId }, data: { actualIssuedQty: l.qty } });
      }
    },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'material_request.approve',
    entity: 'MisMaterialRequest',
    entityId: id,
    before: { status: 'PENDING' },
    after: { status: nextStatus, reference: result.reference, lineCount: result.lineCount, totalQty: String(result.totalQty) },
  });
  // R2-67: the Supervisor who asked hears the decision; R2-80: Owner + Admin hear about an approved General-use issue.
  await notifyRequestDecided(req.requestedById, { requestId: id, requestNumber: req.requestNumber, decision: 'APPROVED', note: note?.trim() || null });
  await notifyGeneralUse(actor.userId, generalFromRow(req), { reference: req.requestNumber, kind: 'issue', requestId: id });
  return result;
}

export async function rejectMaterialRequest(id: string, reason: string) {
  const actor = await requirePermission('store.write');
  if (!reason?.trim()) throw new Error('A reason is required to reject a request.');
  const asked = await db.misMaterialRequest.findUnique({ where: { id }, select: { requestNumber: true, requestedById: true } });
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
  // R2-67: the Supervisor who asked hears why.
  if (asked) await notifyRequestDecided(asked.requestedById, { requestId: id, requestNumber: asked.requestNumber, decision: 'REJECTED', note: reason.trim() });
}

/**
 * R2-77 — approve for picking. The Store decides how much of each line it will give, exactly as `approveMaterialRequest`,
 * but NOTHING leaves the ledger: the request gets one pick list (PENDING). The Store Guy picks and stages it, and stock
 * moves only when the list is handed over to the supervisor (`pick-list.ts#handOverPickList`).
 */
export async function approveMaterialRequestForPicking(id: string, decisions: ApproveLineInput[], note?: string | null) {
  const actor = await requirePermission('store.write');
  const req = await db.misMaterialRequest.findUnique({ where: { id }, include: { lines: true } });
  if (!req) throw new Error('Request not found');
  if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status}`);
  const byLine = new Map(decisions.map((d) => [d.lineId, d.actualIssuedQty]));
  const planned = req.lines.map((line) => ({
    lineId: line.id,
    itemId: line.itemId,
    qty: cappedIssueQty(line.requestedQty.toNumber(), roundQty(Number(byLine.get(line.id) ?? 0))),
  }));
  if (planned.every((l) => l.qty <= 0)) throw new Error('Nothing to pick — set at least one quantity above zero, or reject the request.');

  const list = await db.$transaction(async (tx) => {
    const claimed = await tx.misMaterialRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: actor.userId, decidedAt: new Date(), decisionNote: note?.trim() || null },
    });
    if (claimed.count !== 1) throw new Error('Request was decided by someone else just now.');
    for (const l of planned) await tx.misMaterialRequestLine.update({ where: { id: l.lineId }, data: { actualIssuedQty: l.qty } });
    return tx.misPickList.create({
      data: {
        materialRequestId: id,
        createdById: actor.userId,
        lines: { create: planned.filter((l) => l.qty > 0).map((l) => ({ materialRequestLineId: l.lineId, itemId: l.itemId, requiredQty: l.qty })) },
      },
    });
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'material_request.approve_for_picking',
    entity: 'MisMaterialRequest',
    entityId: id,
    before: { status: 'PENDING' },
    after: { status: 'APPROVED', pickListId: list.id, lineCount: planned.filter((l) => l.qty > 0).length },
  });
  await notifyRequestDecided(req.requestedById, { requestId: id, requestNumber: req.requestNumber, decision: 'APPROVED', note: note?.trim() || null, pickList: true });
  await notifyGeneralUse(actor.userId, generalFromRow(req), { reference: req.requestNumber, kind: 'request', requestId: id });
  return { pickListId: list.id };
}

/**
 * R2-286: issue (some of) the balance of a PARTIALLY_ISSUED request. Each line may take up to what is still owed
 * (requested - issued so far); the request turns APPROVED once every line is fully issued, else stays partial.
 * Same transaction shape as the first approval: the stock movement and the per-line bookkeeping commit together.
 */
export async function issueMaterialRequestBalance(id: string, decisions: ApproveLineInput[], note?: string | null) {
  const actor = await requirePermission('store.write');
  const req = await db.misMaterialRequest.findUnique({ where: { id }, include: { lines: true } });
  if (!req) throw new Error('Request not found');
  if (req.status !== 'PARTIALLY_ISSUED') throw new Error(`Request is ${req.status.toLowerCase().replace(/_/g, ' ')}; only a partially issued request has a balance to issue.`);
  const byLine = new Map(decisions.map((d) => [d.lineId, d.actualIssuedQty]));
  const plan = req.lines.map((line) => {
    const owed = roundQty(line.requestedQty.toNumber() - Number(line.actualIssuedQty ?? 0));
    const qty = cappedIssueQty(owed, roundQty(Number(byLine.get(line.id) ?? 0)));
    return { lineId: line.id, itemId: line.itemId, qty, owed, issuedBefore: Number(line.actualIssuedQty ?? 0) };
  });
  const cart: CartLineInput[] = plan.filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, qty: l.qty }));
  if (cart.length === 0) throw new Error('Nothing to issue — set at least one balance quantity above zero.');
  const fullyIssued = plan.every((l) => l.qty >= l.owed);
  const nextStatus = fullyIssued ? 'APPROVED' : 'PARTIALLY_ISSUED';
  const result = await commitIssue(cart, {
    orderId: req.orderId,
    departmentId: req.departmentId,
    general: generalOf(req),
    materialRequestId: id,
    skipGeneralNotice: true,
    notes: `${req.requestNumber} · balance${note?.trim() ? ` · ${note.trim()}` : ''}`,
    inTransaction: async (tx) => {
      const claimed = await tx.misMaterialRequest.updateMany({ where: { id, status: 'PARTIALLY_ISSUED' }, data: { status: nextStatus } });
      if (claimed.count !== 1) throw new Error('This request was changed by someone else just now.');
      for (const l of plan) {
        if (l.qty > 0) await tx.misMaterialRequestLine.update({ where: { id: l.lineId }, data: { actualIssuedQty: roundQty(l.issuedBefore + l.qty) } });
      }
    },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'material_request.issue_balance',
    entity: 'MisMaterialRequest',
    entityId: id,
    before: { status: 'PARTIALLY_ISSUED' },
    after: { status: nextStatus, reference: result.reference, lineCount: result.lineCount, totalQty: String(result.totalQty) },
  });
  await notifyRequestDecided(req.requestedById, { requestId: id, requestNumber: req.requestNumber, decision: 'APPROVED', note: fullyIssued ? 'Balance issued' : 'Part of the balance issued' });
  return result;
}
