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
  // The latest ledger row of every item in ONE query. One query per item (176 of them) queued on the single-connection
  // runtime pool and the page died with "timeout exceeded when trying to connect" (F-24).
  const latest = await db.$queryRaw<{ item_id: string; balance_qty: unknown; created_at: Date }[]>`
    SELECT DISTINCT ON (item_id) item_id, balance_qty, created_at
    FROM mis_inventory_ledger
    ORDER BY item_id, created_at DESC`;
  const byItem = new Map(latest.map((r) => [r.item_id, r]));
  return items.map((item) => {
    const last = byItem.get(item.id);
    return {
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      balance: last ? Number(last.balance_qty) : 0,
      lastUpdated: last?.created_at ?? null,
    };
  });
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
