import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

export type GrnInput = { poId: string; notes?: string | null };
export type GrnItemInput = {
  poItemId: string;
  receivedQty: number;
  type?: 'GENERAL' | 'FOR_ORDER';
  forOrderRef?: string | null;
  batchNo?: string | null;
  notes?: string | null;
};

export function nextGrnNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const ms = String(Date.now()).slice(-5);
  return `GRN-${y}${m}-${ms}`;
}

export async function listGRNs() {
  await requirePermission('grn.read');
  return db.misGrn.findMany({
    include: {
      po: { select: { id: true, poNumber: true, supplier: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getGRN(id: string) {
  await requirePermission('grn.read');
  return db.misGrn.findUnique({
    where: { id },
    include: {
      po: {
        include: {
          supplier: true,
          items: { include: { item: { select: { id: true, name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } },
        },
      },
      items: {
        include: { poItem: { include: { item: { select: { id: true, name: true } } } } },
      },
    },
  });
}

export async function createGRN(input: GrnInput) {
  const actor = await requirePermission('grn.write');
  const created = await db.misGrn.create({
    data: {
      grnNumber: nextGrnNumber(),
      poId: input.poId,
      notes: input.notes?.trim() || null,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'grn.create', entity: 'MisGrn', entityId: created.id, after: created });
  return created;
}

export async function addGRNItem(grnId: string, input: GrnItemInput) {
  const actor = await requirePermission('grn.write');
  const created = await db.misGrnItem.create({
    data: {
      grnId,
      poItemId: input.poItemId,
      receivedQty: input.receivedQty,
      type: input.type || 'GENERAL',
      forOrderRef: input.forOrderRef?.trim() || null,
      batchNo: input.batchNo?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'grn_item.create', entity: 'MisGrnItem', entityId: created.id, after: created });
  return created;
}

export async function updateGRNItem(id: string, patch: Partial<GrnItemInput>) {
  const actor = await requirePermission('grn.write');
  const before = await db.misGrnItem.findUnique({ where: { id } });
  if (!before) throw new Error(`GRN Item ${id} not found`);
  const after = await db.misGrnItem.update({ where: { id }, data: {
    ...(patch.receivedQty !== undefined ? { receivedQty: patch.receivedQty } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.forOrderRef !== undefined ? { forOrderRef: patch.forOrderRef?.trim() || null } : {}),
    ...(patch.batchNo !== undefined ? { batchNo: patch.batchNo?.trim() || null } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'grn_item.update', entity: 'MisGrnItem', entityId: id, before, after });
  return after;
}

export async function confirmGRN(grnId: string) {
  const actor = await requirePermission('grn.write');
  const grn = await db.misGrn.findUnique({ where: { id: grnId }, include: { items: { include: { poItem: { include: { item: true } } } } } });
  if (!grn) throw new Error(`GRN ${grnId} not found`);
  if (grn.status === 'CONFIRMED') throw new Error('GRN already confirmed');

  // Confirm GRN and update inventory in one transaction
  await db.$transaction(async (tx) => {
    await tx.misGrn.update({
      where: { id: grnId },
      data: { status: 'CONFIRMED', receivedAt: new Date(), receivedById: actor.userId },
    });

    for (const grnItem of grn.items) {
      if (!grnItem.poItem.itemId) continue;
      const itemId = grnItem.poItem.itemId;

      // Get current balance
      const lastLedger = await tx.misInventoryLedger.findFirst({
        where: { itemId },
        orderBy: { createdAt: 'desc' },
        select: { balanceQty: true },
      });
      const currentBalance = lastLedger?.balanceQty.toNumber() ?? 0;
      const newBalance = currentBalance + grnItem.receivedQty.toNumber();

      await tx.misInventoryLedger.create({
        data: {
          itemId,
          changeQty: grnItem.receivedQty,
          balanceQty: newBalance,
          source: 'GRN',
          sourceId: grnId,
          notes: `GRN ${grn.grnNumber}`,
        },
      });

      // Update received quantity on PO item
      await tx.misPoItem.update({
        where: { id: grnItem.poItemId },
        data: { receivedQuantity: { increment: grnItem.receivedQty } },
      });
    }
  });

  await logAuditEvent({ actorId: actor.userId, action: 'grn.confirm', entity: 'MisGrn', entityId: grnId });
  return db.misGrn.findUnique({ where: { id: grnId } });
}

/** GRNs raised but not yet entered against their PO. Count, plus the oldest few. */
export async function listOpenGRNs(limit = 5) {
  await requirePermission('grn.read');
  const where = { status: 'DRAFT' } as const;
  const [total, rows] = await Promise.all([
    db.misGrn.count({ where }),
    db.misGrn.findMany({
      where,
      include: { po: { select: { poNumber: true, supplier: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
  ]);
  return {
    total,
    rows: rows.map((g) => ({
      id: g.id,
      grnNumber: g.grnNumber,
      poNumber: g.po?.poNumber ?? '—',
      supplierName: g.po?.supplier?.name ?? null,
      createdAt: g.createdAt,
    })),
  };
}
