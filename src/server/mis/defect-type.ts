import { MisDefectSeverity } from '@/generated/prisma/enums';
import { db } from '@/server/db';
import { logAuditEvent } from './audit';
import { requirePermission } from './auth';

export type DefectTypeInput = {
  code: string;
  name: string;
  nameHi?: string | null;
  severity: MisDefectSeverity;
  sortOrder?: number;
};

export async function listDefectTypes(includeDeleted = false) {
  await requirePermission('masters.read');
  return db.misDefectType.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getDefectType(id: string) {
  await requirePermission('masters.read');
  return db.misDefectType.findUnique({ where: { id } });
}

export async function createDefectType(input: DefectTypeInput) {
  const actor = await requirePermission('masters.write');
  const created = await db.misDefectType.create({
    data: {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      nameHi: input.nameHi?.trim() || null,
      severity: input.severity,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'defectType.create', entity: 'MisDefectType', entityId: created.id, after: created });
  return created;
}

export async function updateDefectType(id: string, patch: Partial<DefectTypeInput>) {
  const actor = await requirePermission('masters.write');
  const before = await db.misDefectType.findUnique({ where: { id } });
  if (!before) throw new Error(`Defect type ${id} not found`);
  const after = await db.misDefectType.update({
    where: { id },
    data: {
      ...(patch.code !== undefined ? { code: patch.code.trim().toUpperCase() } : {}),
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.nameHi !== undefined ? { nameHi: patch.nameHi?.trim() || null } : {}),
      ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'defectType.update', entity: 'MisDefectType', entityId: id, before, after });
  return after;
}

export async function deleteDefectType(id: string) {
  const actor = await requirePermission('masters.write');
  const before = await db.misDefectType.findUnique({ where: { id } });
  if (!before) throw new Error(`Defect type ${id} not found`);
  const after = await db.misDefectType.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'defectType.delete', entity: 'MisDefectType', entityId: id, before, after });
  return after;
}

export async function restoreDefectType(id: string) {
  const actor = await requirePermission('masters.write');
  const after = await db.misDefectType.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'defectType.restore', entity: 'MisDefectType', entityId: id, after });
  return after;
}

export async function reorderDefectTypes(orderedIds: string[]) {
  const actor = await requirePermission('masters.write');
  await db.$transaction(orderedIds.map((id, i) => db.misDefectType.update({ where: { id }, data: { sortOrder: i } })));
  await logAuditEvent({ actorId: actor.userId, action: 'defectType.reorder', entity: 'MisDefectType', entityId: 'all', after: { order: orderedIds } });
}
