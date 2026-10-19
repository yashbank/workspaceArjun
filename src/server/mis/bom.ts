import { isOrderClosed } from '@/lib/mis/order-status';
import { formatRupees, rollUp, withoutRates } from '@/lib/mis/bom-costing';
import { forRole } from '@/lib/mis/money-fields';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { NOTIFICATION_TYPES } from '@/lib/mis/notification-copy';
import { notifyRoles } from '@/server/mis/notifications';

const statusWords = (status: string) => status.toLowerCase().replace(/_/g, ' ');

/**
 * Structure edits (add / edit / delete / reorder) are for a DRAFT BOM only. Once it is submitted or
 * approved, costing and material requests read it, so it is frozen. Reading is never guarded.
 */
function assertDraft(status: string | null | undefined) {
  if (status !== 'DRAFT') {
    throw new Error(`This BOM is ${statusWords(status ?? 'missing')}, not a draft — it can only be changed while it is a draft.`);
  }
}

/** R3 B106: a closed order's BOM is frozen until the order is reopened. */
function assertOrderOpen(order: { orderNumber: string; status: string } | null | undefined) {
  if (order && isOrderClosed(order.status)) {
    throw new Error(`Order ${order.orderNumber} is ${statusWords(order.status)}. Reopen it first.`);
  }
}

async function requireDraftBom(bomId: string) {
  const bom = await db.misBom.findUnique({ where: { id: bomId }, include: { order: { select: { orderNumber: true, status: true } } } });
  if (!bom) throw new Error(`BOM ${bomId} not found`);
  assertOrderOpen(bom.order);
  assertDraft(bom.status);
  return bom;
}

async function requireDraftStage(stageId: string) {
  const stage = await db.misBomStage.findUnique({ where: { id: stageId }, include: { bom: { select: { status: true, order: { select: { orderNumber: true, status: true } } } } } });
  if (!stage) throw new Error(`BOM stage ${stageId} not found`);
  assertOrderOpen(stage.bom?.order);
  assertDraft(stage.bom?.status);
  return stage;
}

async function requireDraftMaterial(materialId: string) {
  const material = await db.misBomMaterial.findUnique({ where: { id: materialId }, include: { stage: { select: { bom: { select: { status: true } } } } } });
  if (!material) throw new Error(`BOM material ${materialId} not found`);
  assertDraft(material.stage?.bom?.status);
  return material;
}

/**
 * The BOM structure: stages and their materials, quantities and units.
 *
 * `ratePerUnit` is money (D24) and is Owner-only: for any role without `wages.read` the field
 * is REMOVED from every material before this returns, so it is not in the response at all —
 * not blanked, not hidden by the screen. The screens already hid the rate behind `isOwner`,
 * but a hidden column is still in the page payload the browser downloaded (F-06, Phase 14).
 * The cost rolled up from those rates is a separate call, `getBomCosting`, gated the same way.
 */
export async function getBom(orderId: string) {
  const actor = await requirePermission('orders.read');
  const bom = await db.misBom.findUnique({
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
  });
  if (!bom || can(actor.role, 'wages.read')) return bom;
  return withoutRates(bom);
}

export type BomCostingView = {
  /** Formatted on the server — money is never derived client-side. */
  total: string;
  priced: number;
  unpriced: number;
  /** True when anything is unpriced: `total` is a lower bound and must be labelled a floor. */
  isFloor: boolean;
  /** Stage id → subtotal. `null` when the whole stage is unpriced ("not priced", never ₹0). */
  stages: Record<string, { subtotal: string | null; unpriced: number }>;
  /** Material id → cost. `null` when that line has no recorded rate. */
  materials: Record<string, string | null>;
};

/**
 * D6's costing overlay: every material's cost, each stage's subtotal, and the rolled-up total.
 *
 * **Owner only** (`wages.read`, D24). This is the ONLY place a BOM cost is computed, and the gate
 * is the first line: the artboard's own words are that "the cost column is computed on the server
 * and rolled up before it is sent. For every other role the field is not in the response — there
 * is nothing to un-hide." `getBom` withholds the rate itself for those roles, so there is no
 * second route to the figure.
 *
 * "Not priced" is a fact and ₹0 is a lie: a material with no recorded rate comes back as `null`,
 * the total is flagged `isFloor`, and the count says how many lines are missing. See
 * `lib/mis/bom-costing.ts` for the arithmetic (integer paise).
 */
export async function getBomCosting(orderId: string): Promise<BomCostingView | null> {
  await requirePermission('wages.read');

  const bom = await db.misBom.findUnique({
    where: { orderId },
    select: {
      stages: {
        select: { id: true, materials: { select: { id: true, quantity: true, ratePerUnit: true }, orderBy: { seq: 'asc' } } },
        orderBy: { seq: 'asc' },
      },
    },
  });
  if (!bom) return null;

  const costed = rollUp(bom.stages);
  const view: BomCostingView = {
    total: formatRupees(costed.total),
    priced: costed.priced,
    unpriced: costed.unpriced,
    isFloor: costed.isFloor,
    stages: {},
    materials: {},
  };
  for (const stage of costed.stages) {
    // A stage with nothing priced has no subtotal to show: "not priced", not ₹0.
    const nothingPriced = stage.materials.length > 0 && stage.unpriced === stage.materials.length;
    view.stages[stage.id] = { subtotal: nothingPriced ? null : formatRupees(stage.subtotal), unpriced: stage.unpriced };
    for (const material of stage.materials) {
      view.materials[material.id] = material.paise === null ? null : formatRupees(material.paise);
    }
  }
  return view;
}

export async function createBom(orderId: string, notes?: string) {
  const actor = await requirePermission('orders.write');
  const existing = await db.misBom.findUnique({ where: { orderId } });
  if (existing) return existing;
  const order = await db.misOrder.findUnique({ where: { id: orderId }, select: { orderNumber: true, status: true } });
  if (!order) throw new Error('Order not found');
  assertOrderOpen(order);
  const rec = await db.misBom.create({ data: { orderId, notes, createdById: actor.userId } });
  await logAuditEvent({ actorId: actor.userId, action: 'CREATE_BOM', entity: 'MisBom', entityId: rec.id, after: rec });
  return rec;
}

export async function addBomStage(bomId: string, data: { stageName: string; processId?: string; seq: number; notes?: string }) {
  const actor = await requirePermission('orders.write');
  const bom = await requireDraftBom(bomId);
  if (!data.stageName?.trim()) throw new Error('A stage needs a name.');
  // R3 B107: named fields only; bomId always comes from the validated record, never the input.
  const rec = await db.misBomStage.create({
    data: { bomId: bom.id, stageName: data.stageName.trim(), processId: data.processId || undefined, seq: data.seq, notes: data.notes?.trim() || undefined },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'ADD_BOM_STAGE', entity: 'MisBomStage', entityId: rec.id, after: rec });
  return rec;
}

export async function reorderBomStages(bomId: string, stageIdsInOrder: string[]) {
  const actor = await requirePermission('orders.write');
  await requireDraftBom(bomId);
  await db.$transaction(
    stageIdsInOrder.map((id, index) =>
      db.misBomStage.update({ where: { id, bomId }, data: { seq: index } }),
    ),
  );
  await logAuditEvent({
    actorId: actor.userId,
    action: 'REORDER_BOM_STAGES',
    entity: 'MisBom',
    entityId: bomId,
    after: { stageIdsInOrder },
  });
}

export async function addBomMaterial(stageId: string, data: { description: string; itemId?: string; quantity: number; unit: string; ratePerUnit?: number; seq: number }) {
  const actor = await requirePermission('orders.write');
  const stage = await requireDraftStage(stageId);
  // R3 B107: the update-path validation, plus an existing active item when one is named.
  if (!data.description?.trim()) throw new Error('A material needs a description.');
  if (!Number.isFinite(data.quantity) || !(data.quantity > 0)) throw new Error('Quantity must be more than zero.');
  if (!data.unit?.trim()) throw new Error('A material needs a unit.');
  if (data.itemId) {
    const item = await db.misItem.findUnique({ where: { id: data.itemId }, select: { id: true, isActive: true } });
    if (!item || item.isActive === false) throw new Error('That item does not exist or is inactive.');
  }
  // D5: a rate is the Owner's to set; an Admin's value is dropped, not stored. Named fields only:
  // stageId comes from the validated record, never the input.
  const rec = await db.misBomMaterial.create({
    data: {
      stageId: stage.id,
      description: data.description.trim(),
      itemId: data.itemId || undefined,
      quantity: data.quantity,
      unit: data.unit.trim(),
      seq: data.seq,
      ...(can(actor.role, 'wages.read') && data.ratePerUnit !== undefined ? { ratePerUnit: data.ratePerUnit } : {}),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'ADD_BOM_MATERIAL', entity: 'MisBomMaterial', entityId: rec.id, after: rec });
  return forRole(actor.role, rec);
}

/** R3 B108: a BOM goes for approval (and gets approved) only with a stage, a material and an open order. */
async function assertBomComplete(bomId: string, orderId: string) {
  const [stages, materials, order] = await Promise.all([
    db.misBomStage.count({ where: { bomId } }),
    db.misBomMaterial.count({ where: { stage: { bomId } } }),
    db.misOrder.findUnique({ where: { id: orderId }, select: { orderNumber: true, status: true } }),
  ]);
  assertOrderOpen(order);
  if (stages < 1) throw new Error('Add at least one stage before this BOM goes for approval.');
  if (materials < 1) throw new Error('Add at least one material before this BOM goes for approval.');
}

/**
 * F-37 (MIS-123) — neither this function nor `approveBom` used to check the BOM's own current
 * status before acting, so a stale or replayed client request (the UI only shows "Submit" once,
 * but the server never re-checked) could re-submit an already-approved BOM, silently reopening
 * an approval nobody asked to revisit. Only a DRAFT BOM has anything to submit.
 */
export async function submitBomForApproval(bomId: string) {
  const actor = await requirePermission('orders.write');
  const before = await db.misBom.findUnique({ where: { id: bomId } });
  if (!before) throw new Error(`BOM ${bomId} not found`);
  if (before.status !== 'DRAFT') {
    throw new Error(`This BOM is ${before.status.toLowerCase().replace(/_/g, ' ')}, not a draft — there is nothing to submit.`);
  }
  await assertBomComplete(before.id, before.orderId);
  const rec = await db.misBom.update({ where: { id: bomId }, data: { status: 'PENDING_APPROVAL' } });
  await logAuditEvent({ actorId: actor.userId, action: 'SUBMIT_BOM', entity: 'MisBom', entityId: rec.id, before, after: rec });
  return rec;
}

/** F-37 (MIS-123) — see `submitBomForApproval`. Only a BOM actually PENDING_APPROVAL can be approved: not a DRAFT nobody submitted, and not approving an already-APPROVED BOM a second time. */
export async function approveBom(bomId: string) {
  const actor = await requirePermission('wages.read'); // owner-only gate
  const before = await db.misBom.findUnique({ where: { id: bomId } });
  if (!before) throw new Error(`BOM ${bomId} not found`);
  if (before.status !== 'PENDING_APPROVAL') {
    throw new Error(`This BOM is ${before.status.toLowerCase().replace(/_/g, ' ')}, not pending approval.`);
  }
  await assertBomComplete(before.id, before.orderId);
  const rec = await db.misBom.update({
    where: { id: bomId },
    data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: new Date() },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'APPROVE_BOM', entity: 'MisBom', entityId: rec.id, before, after: rec });
  return rec;
}

export async function deleteBomStage(stageId: string) {
  const actor = await requirePermission('orders.write');
  await requireDraftStage(stageId);
  const [logs, checks, phases] = await Promise.all([
    db.misProductionLog.count({ where: { bomStageId: stageId } }),
    db.misQcCheck.count({ where: { bomStageId: stageId } }),
    db.misJobPhase.count({ where: { bomStageId: stageId } }),
  ]);
  if (logs + checks + phases > 0) {
    throw new Error(`Stage is used by ${logs} production entries / ${checks} QC checks / ${phases} phases`);
  }
  await db.misBomStage.delete({ where: { id: stageId } });
  await logAuditEvent({ actorId: actor.userId, action: 'DELETE_BOM_STAGE', entity: 'MisBomStage', entityId: stageId });
}

export async function deleteBomMaterial(materialId: string) {
  const actor = await requirePermission('orders.write');
  await requireDraftMaterial(materialId);
  await db.misBomMaterial.delete({ where: { id: materialId } });
  await logAuditEvent({ actorId: actor.userId, action: 'DELETE_BOM_MATERIAL', entity: 'MisBomMaterial', entityId: materialId });
}

/**
 * #1 — send a submitted BOM back to DRAFT with a reason. Same gate as `approveBom` (the Owner,
 * `wages.read`); only a PENDING_APPROVAL BOM can be rejected. Admin is told through the bell.
 */
export async function rejectBom(orderId: string, reason: string) {
  const actor = await requirePermission('wages.read'); // same gate as approveBom
  const trimmed = reason?.trim() ?? '';
  if (trimmed.length < 3) throw new Error('Give a reason of at least 3 characters so the team knows what to fix.');
  const before = await db.misBom.findUnique({ where: { orderId }, include: { order: { select: { orderNumber: true } } } });
  if (!before) throw new Error('This order has no BOM.');
  if (before.status !== 'PENDING_APPROVAL') {
    throw new Error(`This BOM is ${statusWords(before.status)}, not pending approval.`);
  }
  const rec = await db.misBom.update({ where: { id: before.id }, data: { status: 'DRAFT', approvedById: null, approvedAt: null } });
  await logAuditEvent({ actorId: actor.userId, action: 'REJECT_BOM', entity: 'MisBom', entityId: rec.id, before: { status: before.status }, after: { status: rec.status, reason: trimmed } });
  await notifyRoles(['ADMIN'], NOTIFICATION_TYPES.bomRejected, { orderId, orderNumber: before.order?.orderNumber ?? '', reason: trimmed }, actor.userId);
  return rec;
}

/** #3 — remove a DRAFT BOM (stages and materials with it). Refused while a PO or material request points at the order. */
export async function deleteBom(orderId: string) {
  const actor = await requirePermission('orders.write');
  const before = await db.misBom.findUnique({ where: { orderId }, include: { order: { select: { orderNumber: true } } } });
  if (!before) throw new Error('This order has no BOM.');
  assertDraft(before.status);
  const orderNumber = before.order?.orderNumber;
  if (orderNumber && (await db.misPurchaseOrder.count({ where: { bomRef: orderNumber } })) > 0) {
    throw new Error('A purchase order refers to this BOM, so it cannot be deleted.');
  }
  if ((await db.misMaterialRequest.count({ where: { orderId } })) > 0) {
    throw new Error('A material request refers to this order, so its BOM cannot be deleted.');
  }
  await db.$transaction([
    db.misBomMaterial.deleteMany({ where: { stage: { bomId: before.id } } }),
    db.misBomStage.deleteMany({ where: { bomId: before.id } }),
    db.misBom.delete({ where: { id: before.id } }),
  ]);
  await logAuditEvent({ actorId: actor.userId, action: 'DELETE_BOM', entity: 'MisBom', entityId: before.id, before: { orderId, status: before.status } });
}

/** #10 — edit a stage on a DRAFT BOM. */
export async function updateBomStage(stageId: string, patch: { stageName?: string; notes?: string | null; seq?: number; processId?: string | null }) {
  const actor = await requirePermission('orders.write');
  const before = await requireDraftStage(stageId);
  if (patch.stageName !== undefined && !patch.stageName.trim()) throw new Error('A stage needs a name.');
  const rec = await db.misBomStage.update({
    where: { id: stageId },
    data: {
      ...(patch.stageName !== undefined ? { stageName: patch.stageName.trim() } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
      ...(patch.seq !== undefined ? { seq: patch.seq } : {}),
      // R2-10/R2-70: link (or clear) the master process so routing, line clearance and QC can follow the stage.
      ...(patch.processId !== undefined ? { processId: patch.processId || null } : {}),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'UPDATE_BOM_STAGE', entity: 'MisBomStage', entityId: stageId, before, after: rec });
  return rec;
}

/**
 * #10 — edit a material on a DRAFT BOM. `ratePerUnit` is money (D24): it is honoured only for a
 * caller with `wages.read` and silently ignored for anyone else; the result goes through `forRole`
 * so a non-owner never gets a rate back.
 */
export async function updateBomMaterial(
  materialId: string,
  patch: { description?: string; quantity?: number; unit?: string; seq?: number; ratePerUnit?: number | null; itemId?: string | null },
) {
  const actor = await requirePermission('orders.write');
  const before = await requireDraftMaterial(materialId);
  // R2-10: link (or clear, with null) the catalog item; a named item must exist and be active.
  if (patch.itemId) {
    const item = await db.misItem.findUnique({ where: { id: patch.itemId }, select: { id: true, isActive: true, deletedAt: true } });
    if (!item || item.isActive === false || item.deletedAt) throw new Error('That item does not exist or is inactive.');
  }
  if (patch.description !== undefined && !patch.description.trim()) throw new Error('A material needs a description.');
  if (patch.quantity !== undefined && !(patch.quantity > 0)) throw new Error('Quantity must be more than zero.');
  if (patch.unit !== undefined && !patch.unit.trim()) throw new Error('A material needs a unit.');
  const mayEditRate = can(actor.role, 'wages.read');
  const rec = await db.misBomMaterial.update({
    where: { id: materialId },
    data: {
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit.trim() } : {}),
      ...(patch.seq !== undefined ? { seq: patch.seq } : {}),
      ...(patch.itemId !== undefined ? { itemId: patch.itemId || null } : {}),
      ...(mayEditRate && patch.ratePerUnit !== undefined ? { ratePerUnit: patch.ratePerUnit } : {}),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'UPDATE_BOM_MATERIAL', entity: 'MisBomMaterial', entityId: materialId, before, after: rec });
  return forRole(actor.role, rec);
}
