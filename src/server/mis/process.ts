import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

export type ProcessInput = {
  code: string;
  name: string;
  nameHi?: string | null;
  departmentId?: string | null;
  standardTimeMinutes?: number | null;
  sortOrder?: number;
};

export async function listProcesses(includeDeleted = false) {
  await requirePermission('masters.read');
  return db.misProcess.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    include: { department: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getProcess(id: string) {
  await requirePermission('masters.read');
  return db.misProcess.findUnique({ where: { id }, include: { department: true } });
}

export async function createProcess(input: ProcessInput) {
  const actor = await requirePermission('masters.write');
  const created = await db.misProcess.create({
    data: {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      nameHi: input.nameHi?.trim() || null,
      departmentId: input.departmentId || null,
      standardTimeMinutes: input.standardTimeMinutes ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'process.create', entity: 'MisProcess', entityId: created.id, after: created });
  return created;
}

export async function updateProcess(id: string, patch: Partial<ProcessInput>) {
  const actor = await requirePermission('masters.write');
  const before = await db.misProcess.findUnique({ where: { id } });
  if (!before) throw new Error(`Process ${id} not found`);
  const after = await db.misProcess.update({ where: { id }, data: {
    ...(patch.code !== undefined ? { code: patch.code.trim().toUpperCase() } : {}),
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.nameHi !== undefined ? { nameHi: patch.nameHi?.trim() || null } : {}),
    ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId || null } : {}),
    ...(patch.standardTimeMinutes !== undefined ? { standardTimeMinutes: patch.standardTimeMinutes } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'process.update', entity: 'MisProcess', entityId: id, before, after });
  return after;
}

export async function deleteProcess(id: string) {
  const actor = await requirePermission('masters.write');
  const before = await db.misProcess.findUnique({ where: { id } });
  if (!before) throw new Error(`Process ${id} not found`);
  const after = await db.misProcess.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'process.delete', entity: 'MisProcess', entityId: id, before, after });
  return after;
}

export async function restoreProcess(id: string) {
  const actor = await requirePermission('masters.write');
  const after = await db.misProcess.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'process.restore', entity: 'MisProcess', entityId: id, after });
  return after;
}
