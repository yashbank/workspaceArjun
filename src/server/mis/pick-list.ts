import { storedGeneralInput as generalOf } from '@/lib/mis/general-use';
import { applyPicks, canRecordPicks, handoverCart, stagingRefusal, type PickLine, type PickStatus } from '@/lib/mis/pick-list';
import { db } from '@/server/db';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { commitIssue } from './store';
import { notifyRequestDecided } from './store-notices';

/**
 * R2-77 — Pick & Staging.
 *
 * approved Material Request -> Pick List -> Store Guy picks -> Staged -> handed to the supervisor.
 * Reading is `store.read` (the Supervisor follows their own request); every change is `store.write`.
 * Stock moves ONLY in `handOverPickList`, through `commitIssue`, so the ledger, the storekeeper's book, the order
 * allocation cap and the General-use tagging apply exactly as they do to a direct issue.
 */

const INCLUDE = {
  materialRequest: {
    select: {
      id: true, requestNumber: true, orderId: true, departmentId: true, requestedById: true, isGeneral: true, generalReason: true, costCenter: true,
      order: { select: { orderNumber: true } }, department: { select: { name: true } },
    },
  },
  lines: { include: { item: { select: { id: true, code: true, name: true, unit: true } } }, orderBy: { createdAt: 'asc' } },
} as const;

export async function listPickLists() {
  await requirePermission('store.read');
  return db.misPickList.findMany({ include: INCLUDE, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 });
}

export async function getPickList(id: string) {
  await requirePermission('store.read');
  return db.misPickList.findUnique({ where: { id }, include: INCLUDE });
}

const toPickLines = (lines: { id: string; requiredQty: { toNumber(): number }; pickedQty: { toNumber(): number } }[]): PickLine[] =>
  lines.map((l) => ({ id: l.id, requiredQty: l.requiredQty.toNumber(), pickedQty: l.pickedQty.toNumber() }));

async function loadOpen(id: string) {
  const list = await db.misPickList.findUnique({ where: { id }, include: { lines: true } });
  if (!list) throw new Error('Pick list not found');
  return list;
}

/** Record what was picked (0..approved per line). The first record moves the list to PICKING. No stock moves. */
export async function recordPicks(id: string, picks: { lineId: string; pickedQty: number }[]) {
  const actor = await requirePermission('store.write');
  const list = await loadOpen(id);
  const status = list.status as PickStatus;
  if (!canRecordPicks(status)) throw new Error(`This pick list is already ${status.toLowerCase().replace('_', ' ')} — picks can no longer change.`);
  const next = applyPicks(toPickLines(list.lines), picks);
  await db.$transaction(async (tx) => {
    const claimed = await tx.misPickList.updateMany({ where: { id, status: { in: ['PENDING', 'PICKING'] } }, data: { status: 'PICKING', pickedById: actor.userId } });
    if (claimed.count !== 1) throw new Error('This pick list was staged or handed over just now — reload.');
    for (const l of next) await tx.misPickListLine.update({ where: { id: l.id }, data: { pickedQty: l.pickedQty } });
  });
  await logAuditEvent({
    actorId: actor.userId, action: 'pick_list.pick', entity: 'MisPickList', entityId: id,
    before: { status }, after: { status: 'PICKING', picked: next.map((l) => ({ lineId: l.id, pickedQty: l.pickedQty })) },
  });
}

/** PICKING -> STAGED: the material is set aside, ready for the supervisor. Still no stock movement. */
export async function stagePickList(id: string) {
  const actor = await requirePermission('store.write');
  const list = await loadOpen(id);
  if (list.status !== 'PICKING') throw new Error(list.status === 'PENDING' ? 'Record what you picked before staging the list.' : `This pick list is already ${list.status.toLowerCase().replace('_', ' ')}.`);
  const refusal = stagingRefusal(toPickLines(list.lines));
  if (refusal) throw new Error(refusal);
  const claimed = await db.misPickList.updateMany({ where: { id, status: 'PICKING' }, data: { status: 'STAGED', stagedAt: new Date() } });
  if (claimed.count !== 1) throw new Error('This pick list changed just now — reload.');
  await logAuditEvent({ actorId: actor.userId, action: 'pick_list.stage', entity: 'MisPickList', entityId: id, before: { status: 'PICKING' }, after: { status: 'STAGED' } });
}

/**
 * STAGED -> HANDED_OVER, and THE moment stock leaves the store: what was picked is issued through `commitIssue` on the
 * same transaction that flips the list, so a short balance refuses the handover and leaves the list STAGED.
 */
export async function handOverPickList(id: string) {
  const actor = await requirePermission('store.write');
  const list = await db.misPickList.findUnique({ where: { id }, include: { lines: true, materialRequest: true } });
  if (!list) throw new Error('Pick list not found');
  if (list.status !== 'STAGED') throw new Error(list.status === 'HANDED_OVER' ? 'This pick list was already handed over.' : 'Stage the pick list before handing it over.');
  const cartLines = handoverCart(toPickLines(list.lines));
  const itemOf = new Map(list.lines.map((l) => [l.id, l.itemId]));
  const req = list.materialRequest;
  const result = await commitIssue(
    cartLines.map((c) => ({ itemId: itemOf.get(c.lineId)!, qty: c.qty })),
    {
      orderId: req.orderId,
      departmentId: req.departmentId,
      general: generalOf(req),
      materialRequestId: req.id,
      releasesPickListId: id, // R2-287: this list's own hold does not count against its handover
      // The approval for picking already told Owner + Admin about this General-use request; the handover stays quiet.
      skipGeneralNotice: true,
      notes: `${req.requestNumber} · pick list handover`,
      inTransaction: async (tx) => {
        const claimed = await tx.misPickList.updateMany({
          where: { id, status: 'STAGED' },
          data: { status: 'HANDED_OVER', handedOverAt: new Date(), handedOverById: actor.userId, handedOverToId: req.requestedById },
        });
        if (claimed.count !== 1) throw new Error('This pick list was handed over just now.');
        // The request records what actually left the store (the picked quantity), not what was approved for picking.
        const issuedByLine = new Map(cartLines.map((c) => [c.lineId, c.qty]));
        for (const l of list.lines) {
          if (!l.materialRequestLineId) continue;
          await tx.misMaterialRequestLine.update({ where: { id: l.materialRequestLineId }, data: { actualIssuedQty: issuedByLine.get(l.id) ?? 0 } });
        }
      },
    },
  );
  await logAuditEvent({
    actorId: actor.userId, action: 'pick_list.handover', entity: 'MisPickList', entityId: id,
    before: { status: 'STAGED' },
    after: { status: 'HANDED_OVER', reference: result.reference, lineCount: result.lineCount, totalQty: String(result.totalQty), handedOverToId: req.requestedById },
  });
  // The supervisor is told the material is theirs to collect.
  await notifyRequestDecided(req.requestedById, { requestId: req.id, requestNumber: req.requestNumber, decision: 'APPROVED', note: 'Handed over to you — material issued', pickList: false });
  return result;
}
