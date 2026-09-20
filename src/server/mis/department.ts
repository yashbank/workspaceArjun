import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

export type DeptInput = {
  code: string;
  name: string;
  nameHi?: string | null;
  sortOrder?: number;
};

export async function listDepts(includeDeleted = false) {
  await requirePermission('masters.read');
  return db.misDepartment.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getDept(id: string) {
  await requirePermission('masters.read');
  return db.misDepartment.findUnique({ where: { id } });
}

export async function createDept(input: DeptInput) {
  const actor = await requirePermission('masters.write');
  const created = await db.misDepartment.create({
    data: {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      nameHi: input.nameHi?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'dept.create', entity: 'MisDepartment', entityId: created.id, after: created });
  return created;
}

export async function updateDept(id: string, patch: Partial<DeptInput>) {
  const actor = await requirePermission('masters.write');
  const before = await db.misDepartment.findUnique({ where: { id } });
  if (!before) throw new Error(`Department ${id} not found`);
  const after = await db.misDepartment.update({
    where: { id },
    data: {
      ...(patch.code !== undefined ? { code: patch.code.trim().toUpperCase() } : {}),
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.nameHi !== undefined ? { nameHi: patch.nameHi?.trim() || null } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'dept.update', entity: 'MisDepartment', entityId: id, before, after });
  return after;
}

export async function deleteDept(id: string) {
  const actor = await requirePermission('masters.write');
  const before = await db.misDepartment.findUnique({ where: { id } });
  if (!before) throw new Error(`Department ${id} not found`);
  const after = await db.misDepartment.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'dept.delete', entity: 'MisDepartment', entityId: id, before, after });
  return after;
}

export async function restoreDept(id: string) {
  const actor = await requirePermission('masters.write');
  const after = await db.misDepartment.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'dept.restore', entity: 'MisDepartment', entityId: id, after });
  return after;
}

export async function reorderDepts(orderedIds: string[]) {
  const actor = await requirePermission('masters.write');
  await db.$transaction(orderedIds.map((id, i) => db.misDepartment.update({ where: { id }, data: { sortOrder: i } })));
  await logAuditEvent({ actorId: actor.userId, action: 'dept.reorder', entity: 'MisDepartment', entityId: 'all', after: { order: orderedIds } });
}
