import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

export type SupplierInput = {
  code: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  gstNo?: string | null;
  paymentTermsDays?: number | null;
};

export async function listSuppliers(includeDeleted = false) {
  await requirePermission('po.read');
  return db.misSupplier.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function getSupplier(id: string) {
  await requirePermission('po.read');
  return db.misSupplier.findUnique({ where: { id } });
}

export async function createSupplier(input: SupplierInput) {
  const actor = await requirePermission('po.write');
  const created = await db.misSupplier.create({
    data: {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      gstNo: input.gstNo?.trim() || null,
      paymentTermsDays: input.paymentTermsDays ?? null,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'supplier.create', entity: 'MisSupplier', entityId: created.id, after: created });
  return created;
}

export async function updateSupplier(id: string, patch: Partial<SupplierInput>) {
  const actor = await requirePermission('po.write');
  const before = await db.misSupplier.findUnique({ where: { id } });
  if (!before) throw new Error(`Supplier ${id} not found`);
  const after = await db.misSupplier.update({ where: { id }, data: {
    ...(patch.code !== undefined ? { code: patch.code.trim().toUpperCase() } : {}),
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone?.trim() || null } : {}),
    ...(patch.address !== undefined ? { address: patch.address?.trim() || null } : {}),
    ...(patch.city !== undefined ? { city: patch.city?.trim() || null } : {}),
    ...(patch.gstNo !== undefined ? { gstNo: patch.gstNo?.trim() || null } : {}),
    ...(patch.paymentTermsDays !== undefined ? { paymentTermsDays: patch.paymentTermsDays } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'supplier.update', entity: 'MisSupplier', entityId: id, before, after });
  return after;
}

export async function deleteSupplier(id: string) {
  const actor = await requirePermission('po.write');
  const before = await db.misSupplier.findUnique({ where: { id } });
  if (!before) throw new Error(`Supplier ${id} not found`);
  const after = await db.misSupplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'supplier.delete', entity: 'MisSupplier', entityId: id, before, after });
  return after;
}

export async function restoreSupplier(id: string) {
  const actor = await requirePermission('po.write');
  const after = await db.misSupplier.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'supplier.restore', entity: 'MisSupplier', entityId: id, after });
  return after;
}
