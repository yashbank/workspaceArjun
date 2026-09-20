'use server';
import { adjustInventory } from '@/server/mis/inventory';
import { requirePermission } from '@/server/mis/auth';
import { db } from '@/server/db';
import { logAuditEvent } from '@/server/mis/audit';
import { MisItemCategory, MisItemUnit } from '@/generated/prisma/enums';
import { revalidatePath } from 'next/cache';

export async function adjustInventoryAction(itemId: string, changeQty: number, notes?: string) {
  await adjustInventory(itemId, changeQty, notes);
  revalidatePath('/mis/inventory');
}

export interface CreateItemInput {
  name: string;
  code?: string;
  sku?: string;
  category: MisItemCategory;
  unit: MisItemUnit;
  pricePerUnit?: string;
}

export async function createItemAction(input: CreateItemInput) {
  const actor = await requirePermission('masters.write');
  const pricePerUnit = input.pricePerUnit && !isNaN(Number(input.pricePerUnit)) ? Number(input.pricePerUnit) : null;

  let code = (input.code ?? '').trim().toUpperCase();
  if (!code) {
    const count = await db.misItem.count();
    code = `ITM-${String(count + 1).padStart(4, '0')}`;
  }

  const created = await db.misItem.create({
    data: {
      code,
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      category: input.category,
      unit: input.unit,
      pricePerUnit,
      isDemo: false,
    },
  });

  await logAuditEvent({ actorId: actor.userId, action: 'item.create', entity: 'MisItem', entityId: created.id, after: created });
  revalidatePath('/mis/inventory');
  return { id: created.id, code: created.code };
}
