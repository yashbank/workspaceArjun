import { db } from '@/server/db';
import { requirePermission } from './auth';

export async function getInventoryBalance(itemId: string) {
  await requirePermission('inventory.read');
  const last = await db.misInventoryLedger.findFirst({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    select: { balanceQty: true, createdAt: true },
  });
  return { itemId, balance: last?.balanceQty.toNumber() ?? 0, lastUpdated: last?.createdAt ?? null };
}

export async function listInventoryLedger(itemId: string) {
  await requirePermission('inventory.read');
  return db.misInventoryLedger.findMany({
    where: { itemId },
    include: { item: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getInventorySummary() {
  await requirePermission('inventory.read');
  const items = await db.misItem.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  const result = await Promise.all(
    items.map(async (item) => {
      const last = await db.misInventoryLedger.findFirst({
        where: { itemId: item.id },
        orderBy: { createdAt: 'desc' },
        select: { balanceQty: true, createdAt: true },
      });
      return {
        itemId: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        balance: last?.balanceQty.toNumber() ?? 0,
        lastUpdated: last?.createdAt ?? null,
      };
    })
  );
  return result;
}

export async function adjustInventory(itemId: string, changeQty: number, notes?: string) {
  await requirePermission('inventory.write');
  // Get current balance
  const last = await db.misInventoryLedger.findFirst({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    select: { balanceQty: true },
  });
  const current = last?.balanceQty.toNumber() ?? 0;
  const newBalance = current + changeQty;
  if (newBalance < 0) throw new Error('Adjustment would result in negative balance');
  await db.misInventoryLedger.create({
    data: {
      itemId,
      changeQty,
      balanceQty: newBalance,
      source: 'MANUAL_ADJUSTMENT',
      notes: notes?.trim() || null,
    },
  });
  return newBalance;
}
