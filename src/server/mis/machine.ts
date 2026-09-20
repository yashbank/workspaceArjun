import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

export type MachineInput = {
  code: string;
  name: string;
  departmentId?: string | null;
  machineType?: string | null;
  capacityPerDay?: number | null;
};

export async function listMachines(includeDeleted = false) {
  await requirePermission('masters.read');
  return db.misMachine.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    include: { department: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getMachine(id: string) {
  await requirePermission('masters.read');
  return db.misMachine.findUnique({ where: { id }, include: { department: true } });
}

export async function createMachine(input: MachineInput) {
  const actor = await requirePermission('masters.write');
  const created = await db.misMachine.create({
    data: {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      departmentId: input.departmentId || null,
      machineType: input.machineType?.trim() || null,
      capacityPerDay: input.capacityPerDay ?? null,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'machine.create', entity: 'MisMachine', entityId: created.id, after: created });
  return created;
}

export async function updateMachine(id: string, patch: Partial<MachineInput>) {
  const actor = await requirePermission('masters.write');
  const before = await db.misMachine.findUnique({ where: { id } });
  if (!before) throw new Error(`Machine ${id} not found`);
  const after = await db.misMachine.update({
    where: { id },
    data: {
      ...(patch.code !== undefined ? { code: patch.code.trim().toUpperCase() } : {}),
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId || null } : {}),
      ...(patch.machineType !== undefined ? { machineType: patch.machineType?.trim() || null } : {}),
      ...(patch.capacityPerDay !== undefined ? { capacityPerDay: patch.capacityPerDay } : {}),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'machine.update', entity: 'MisMachine', entityId: id, before, after });
  return after;
}

export async function deleteMachine(id: string) {
  const actor = await requirePermission('masters.write');
  const before = await db.misMachine.findUnique({ where: { id } });
  if (!before) throw new Error(`Machine ${id} not found`);
  const after = await db.misMachine.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'machine.delete', entity: 'MisMachine', entityId: id, before, after });
  return after;
}

export async function restoreMachine(id: string) {
  const actor = await requirePermission('masters.write');
  const after = await db.misMachine.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'machine.restore', entity: 'MisMachine', entityId: id, after });
  return after;
}
