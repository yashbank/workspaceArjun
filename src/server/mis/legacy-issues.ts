import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { formatFactoryDateTime } from '@/lib/mis/factory-time';

/**
 * R3-QCR B83: the legacy, unkeyed store issues, as a READ-ONLY report (no data change).
 *
 * Before order-linked issuing, `STORE_ISSUE` ledger rows were written with no `sourceId` (or one that
 * matches no order), so Traceability never counted them. This lists exactly those rows so the owner can
 * see them. It carries NO price, rate or value: quantities and balances only.
 */
export type LegacyIssueRow = {
  id: string;
  /** The factory's date and time, `dd/mm/yyyy hh:mm`. */
  when: string;
  itemCode: string;
  itemName: string;
  /** Positive: the quantity that left stock. */
  quantity: number;
  balanceAfter: number;
  createdBy: string | null;
  notes: string | null;
  /** The matching store transaction's reference number, if one can be matched. */
  referenceNo: string | null;
};

/** A ledger row and its store transaction are written in the same DB transaction: seconds apart at most. */
const MATCH_WINDOW_MS = 60 * 1000;

export async function listLegacyStoreIssues(): Promise<LegacyIssueRow[]> {
  // Both permissions: the stock ledger AND the reports area.
  await requirePermission('inventory.read');
  await requirePermission('reports.read');

  const ledger = await db.misInventoryLedger.findMany({
    where: { source: 'STORE_ISSUE' },
    include: { item: { select: { code: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  // sourceId is null, or points at no order. One lookup for the distinct ids, not one per row.
  const sourceIds = [...new Set(ledger.map((l) => l.sourceId).filter((s): s is string => !!s))];
  const orders = sourceIds.length ? await db.misOrder.findMany({ where: { id: { in: sourceIds } }, select: { id: true } }) : [];
  const knownOrders = new Set(orders.map((o) => o.id));
  const legacy = ledger.filter((l) => !l.sourceId || !knownOrders.has(l.sourceId));
  if (legacy.length === 0) return [];

  const itemIds = [...new Set(legacy.map((l) => l.itemId))];
  const txns = await db.misStoreTransaction.findMany({
    where: { itemId: { in: itemIds }, type: 'OUT' },
    select: { itemId: true, quantity: true, referenceNo: true, createdById: true, createdAt: true },
  });
  const creatorIds = [...new Set(txns.map((t) => t.createdById).filter((s): s is string => !!s))];
  const profiles = creatorIds.length ? await db.userProfile.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(profiles.map((p) => [p.id, p.name]));
  const timeZone = await getFactoryTimezone();

  return legacy.map((l) => {
    const qty = Math.abs(Number(l.changeQty));
    const match = txns.find(
      (t) => t.itemId === l.itemId && Number(t.quantity) === qty && Math.abs(new Date(t.createdAt).getTime() - new Date(l.createdAt).getTime()) <= MATCH_WINDOW_MS,
    );
    return {
      id: l.id,
      when: formatFactoryDateTime(new Date(l.createdAt), timeZone),
      itemCode: l.item?.code ?? '—',
      itemName: l.item?.name ?? '—',
      quantity: qty,
      balanceAfter: Number(l.balanceQty),
      createdBy: match?.createdById ? (nameById.get(match.createdById) ?? null) : null,
      notes: l.notes ?? null,
      referenceNo: match?.referenceNo ?? null,
    };
  });
}
