import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

export type CustomerInput = {
  code: string;
  name: string;
  nameHi?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  gstNo?: string | null;
};

export async function listCustomers(includeDeleted = false) {
  await requirePermission('orders.read');
  return db.misCustomer.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function getCustomer(id: string) {
  await requirePermission('orders.read');
  return db.misCustomer.findUnique({ where: { id } });
}

export async function searchCustomers(query: string) {
  await requirePermission('orders.read');
  return db.misCustomer.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { code: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: { name: 'asc' },
  });
}

export async function createCustomer(input: CustomerInput) {
  const actor = await requirePermission('orders.write');
  const created = await db.misCustomer.create({
    data: {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      nameHi: input.nameHi?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      gstNo: input.gstNo?.trim() || null,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'customer.create', entity: 'MisCustomer', entityId: created.id, after: created });
  return created;
}

export async function updateCustomer(id: string, patch: Partial<CustomerInput>) {
  const actor = await requirePermission('orders.write');
  const before = await db.misCustomer.findUnique({ where: { id } });
  if (!before) throw new Error(`Customer ${id} not found`);
  const after = await db.misCustomer.update({ where: { id }, data: {
    ...(patch.code !== undefined ? { code: patch.code.trim().toUpperCase() } : {}),
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.nameHi !== undefined ? { nameHi: patch.nameHi?.trim() || null } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone?.trim() || null } : {}),
    ...(patch.address !== undefined ? { address: patch.address?.trim() || null } : {}),
    ...(patch.city !== undefined ? { city: patch.city?.trim() || null } : {}),
    ...(patch.gstNo !== undefined ? { gstNo: patch.gstNo?.trim() || null } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'customer.update', entity: 'MisCustomer', entityId: id, before, after });
  return after;
}

export async function deleteCustomer(id: string) {
  const actor = await requirePermission('orders.write');
  const before = await db.misCustomer.findUnique({ where: { id } });
  if (!before) throw new Error(`Customer ${id} not found`);
  const after = await db.misCustomer.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'customer.delete', entity: 'MisCustomer', entityId: id, before, after });
  return after;
}

export async function restoreCustomer(id: string) {
  const actor = await requirePermission('orders.write');
  const after = await db.misCustomer.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'customer.restore', entity: 'MisCustomer', entityId: id, after });
  return after;
}
