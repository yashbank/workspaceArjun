import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';

export async function getBom(orderId: string) {
  await requirePermission('orders.read');
  return db.misBom.findUnique({
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
  return rec;
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
