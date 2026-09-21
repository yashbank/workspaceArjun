import { formatRupees, rollUp, withoutRates } from '@/lib/mis/bom-costing';
import { forRole } from '@/lib/mis/money-fields';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';

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
  const rec = await db.misBom.create({ data: { orderId, notes, createdById: actor.userId } });
  await logAuditEvent({ actorId: actor.userId, action: 'CREATE_BOM', entity: 'MisBom', entityId: rec.id, after: rec });
  return rec;
}

export async function addBomStage(bomId: string, data: { stageName: string; processId?: string; seq: number; notes?: string }) {
  const actor = await requirePermission('orders.write');
  const rec = await db.misBomStage.create({ data: { bomId, ...data } });
  await logAuditEvent({ actorId: actor.userId, action: 'ADD_BOM_STAGE', entity: 'MisBomStage', entityId: rec.id, after: rec });
  return rec;
}

export async function reorderBomStages(bomId: string, stageIdsInOrder: string[]) {
  const actor = await requirePermission('orders.write');
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
  const rec = await db.misBomMaterial.create({ data: { stageId, ...data } });
  await logAuditEvent({ actorId: actor.userId, action: 'ADD_BOM_MATERIAL', entity: 'MisBomMaterial', entityId: rec.id, after: rec });
  return forRole(actor.role, rec);
}

export async function submitBomForApproval(bomId: string) {
  const actor = await requirePermission('orders.write');
  const rec = await db.misBom.update({ where: { id: bomId }, data: { status: 'PENDING_APPROVAL' } });
  await logAuditEvent({ actorId: actor.userId, action: 'SUBMIT_BOM', entity: 'MisBom', entityId: rec.id, after: rec });
  return rec;
}

export async function approveBom(bomId: string) {
  const actor = await requirePermission('wages.read'); // owner-only gate
  const rec = await db.misBom.update({
    where: { id: bomId },
    data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: new Date() },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'APPROVE_BOM', entity: 'MisBom', entityId: rec.id, after: rec });
  return rec;
}

export async function deleteBomStage(stageId: string) {
  const actor = await requirePermission('orders.write');
  await db.misBomStage.delete({ where: { id: stageId } });
  await logAuditEvent({ actorId: actor.userId, action: 'DELETE_BOM_STAGE', entity: 'MisBomStage', entityId: stageId });
}

export async function deleteBomMaterial(materialId: string) {
  const actor = await requirePermission('orders.write');
  await db.misBomMaterial.delete({ where: { id: materialId } });
  await logAuditEvent({ actorId: actor.userId, action: 'DELETE_BOM_MATERIAL', entity: 'MisBomMaterial', entityId: materialId });
}
