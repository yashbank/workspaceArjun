import { can } from '@/lib/mis/permissions';
import { forRole, withoutMoneyFields } from '@/lib/mis/money-fields';
import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';
import { createWithItemCode } from './item-code';

const MAX_NAME = 120;
const MAX_CODE = 40;

function cleanName(name: string | undefined): string {
  const n = (name ?? '').trim();
  if (n.length < 1 || n.length > MAX_NAME) throw new Error(`Item name is required (1 to ${MAX_NAME} characters).`);
  return n;
}

function cleanCode(code: string): string {
  const c = code.trim().toUpperCase();
  if (!c) throw new Error('Item code cannot be empty.');
  if (c.length > MAX_CODE) throw new Error(`Item code is too long (max ${MAX_CODE} characters).`);
  return c;
}

export type ItemInput = {
  code: string;
  name: string;
  gsm?: string | null;
  size?: string | null;
  substrate?: string | null;
  coating?: string | null;
  unit?: string;
};

/** R2-25: unit is free text fed by the UNIT master options; only shape is checked here. */
export function toItemUnit(unit: string | undefined, fallback = 'KG'): string {
  if (unit === undefined) return fallback;
  const u = unit.trim();
  if (u.length < 1 || u.length > 20) throw new Error('Unit is required (1 to 20 characters).');
  return u;
}

// `pricePerUnit` is money (D24, F-06). The three readers below serve every masters.read role (Admin,
// Supervisor, QC); the price is REMOVED from what a role without `wages.read` receives.
export async function listItems(includeDeleted = false) {
  const actor = await requirePermission('masters.read');
  const items = await db.misItem.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: { name: 'asc' },
  });
  return can(actor.role, 'wages.read') ? items : withoutMoneyFields(items);
}

export async function getItem(id: string) {
  const actor = await requirePermission('masters.read');
  const item = await db.misItem.findUnique({ where: { id } });
  return item && !can(actor.role, 'wages.read') ? withoutMoneyFields(item) : item;
}

export async function searchItems(query: string) {
  const actor = await requirePermission('masters.read');
  const items = await db.misItem.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: query, mode: 'insensitive' } }, { code: { contains: query, mode: 'insensitive' } }] },
    take: 20, orderBy: { name: 'asc' },
  });
  return can(actor.role, 'wages.read') ? items : withoutMoneyFields(items);
}

export async function createItem(input: ItemInput) {
  const actor = await requirePermission('masters.write');
  const name = cleanName(input.name);
  const unit = toItemUnit(input.unit);
  const data = {
    name,
    gsm: input.gsm?.trim() || null,
    size: input.size?.trim() || null,
    substrate: input.substrate?.trim() || null,
    coating: input.coating?.trim() || null,
    unit,
  };
  // A blank code is allocated (next ITM-NNNN, deleted items counted); a typed one is used as given.
  const created = input.code?.trim()
    ? await db.misItem.create({ data: { code: cleanCode(input.code), ...data } })
    : await createWithItemCode(db, (code) => db.misItem.create({ data: { code, ...data } }));
  await logAuditEvent({ actorId: actor.userId, action: 'item.create', entity: 'MisItem', entityId: created.id, after: created });
  return forRole(actor.role, created);
}

export async function updateItem(id: string, patch: Partial<ItemInput>) {
  const actor = await requirePermission('masters.write');
  const before = await db.misItem.findUnique({ where: { id } });
  if (!before) throw new Error(`Item ${id} not found`);
  const after = await db.misItem.update({ where: { id }, data: {
    ...(patch.code !== undefined ? { code: cleanCode(patch.code) } : {}),
    ...(patch.name !== undefined ? { name: cleanName(patch.name) } : {}),
    ...(patch.gsm !== undefined ? { gsm: patch.gsm?.trim() || null } : {}),
    ...(patch.size !== undefined ? { size: patch.size?.trim() || null } : {}),
    ...(patch.substrate !== undefined ? { substrate: patch.substrate?.trim() || null } : {}),
    ...(patch.coating !== undefined ? { coating: patch.coating?.trim() || null } : {}),
    ...(patch.unit !== undefined ? { unit: toItemUnit(patch.unit) } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'item.update', entity: 'MisItem', entityId: id, before, after });
  return forRole(actor.role, after);
}

export async function deleteItem(id: string) {
  const actor = await requirePermission('masters.write');
  const before = await db.misItem.findUnique({ where: { id } });
  if (!before) throw new Error(`Item ${id} not found`);
  const after = await db.misItem.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'item.delete', entity: 'MisItem', entityId: id, before, after });
  return forRole(actor.role, after);
}

export async function restoreItem(id: string) {
  const actor = await requirePermission('masters.write');
  const after = await db.misItem.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'item.restore', entity: 'MisItem', entityId: id, after });
  return forRole(actor.role, after);
}
