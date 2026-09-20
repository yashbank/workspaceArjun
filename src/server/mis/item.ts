import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';
import { MisItemUnit } from '@/generated/prisma/enums';

export type ItemInput = {
  code: string;
  name: string;
  gsm?: string | null;
  size?: string | null;
  substrate?: string | null;
  coating?: string | null;
  unit?: string;
};

const VALID_UNITS = new Set<string>(Object.values(MisItemUnit));

function toItemUnit(unit: string | undefined, fallback: MisItemUnit): MisItemUnit {
  if (unit === undefined) return fallback;
  if (!VALID_UNITS.has(unit)) throw new Error(`Invalid unit: ${unit}`);
  return unit as MisItemUnit;
}

export async function listItems(includeDeleted = false) {
  await requirePermission('masters.read');
  return db.misItem.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function getItem(id: string) {
  await requirePermission('masters.read');
  return db.misItem.findUnique({ where: { id } });
}

export async function searchItems(query: string) {
  await requirePermission('masters.read');
  return db.misItem.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: query, mode: 'insensitive' } }, { code: { contains: query, mode: 'insensitive' } }] },
    take: 20, orderBy: { name: 'asc' },
  });
}

export async function createItem(input: ItemInput) {
  const actor = await requirePermission('masters.write');
  const created = await db.misItem.create({
    data: {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      gsm: input.gsm?.trim() || null,
      size: input.size?.trim() || null,
      substrate: input.substrate?.trim() || null,
      coating: input.coating?.trim() || null,
      unit: toItemUnit(input.unit, MisItemUnit.KG),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'item.create', entity: 'MisItem', entityId: created.id, after: created });
  return created;
}

export async function updateItem(id: string, patch: Partial<ItemInput>) {
  const actor = await requirePermission('masters.write');
  const before = await db.misItem.findUnique({ where: { id } });
  if (!before) throw new Error(`Item ${id} not found`);
  const after = await db.misItem.update({ where: { id }, data: {
    ...(patch.code !== undefined ? { code: patch.code.trim().toUpperCase() } : {}),
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.gsm !== undefined ? { gsm: patch.gsm?.trim() || null } : {}),
    ...(patch.size !== undefined ? { size: patch.size?.trim() || null } : {}),
    ...(patch.substrate !== undefined ? { substrate: patch.substrate?.trim() || null } : {}),
    ...(patch.coating !== undefined ? { coating: patch.coating?.trim() || null } : {}),
    ...(patch.unit !== undefined ? { unit: toItemUnit(patch.unit, MisItemUnit.KG) } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'item.update', entity: 'MisItem', entityId: id, before, after });
  return after;
}

export async function deleteItem(id: string) {
  const actor = await requirePermission('masters.write');
  const before = await db.misItem.findUnique({ where: { id } });
  if (!before) throw new Error(`Item ${id} not found`);
  const after = await db.misItem.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'item.delete', entity: 'MisItem', entityId: id, before, after });
  return after;
}

export async function restoreItem(id: string) {
  const actor = await requirePermission('masters.write');
  const after = await db.misItem.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'item.restore', entity: 'MisItem', entityId: id, after });
  return after;
}
