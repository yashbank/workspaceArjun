import { RETURN_ALREADY_DECIDED, returnStartsAccepted, validateReturn } from '@/lib/mis/store-return';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { itemLockKey } from '@/lib/mis/stock-lock-keys';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { isUniqueConstraintError } from './orders';
import { lockStockKeys } from './stock-lock';
import { lastLedgerBalance, lastTxnBalance, nextTxnSeq, round2, storeFactoryZone, STXN_SEQ_KEY, txnNumberOf } from './store-books';

/**
 * R2-79 — Return-to-Store.
 *
 * Unused or rejected material coming back from the floor. A Supervisor (or anyone with `store.read`) raises the
 * return with a reason; it waits PENDING for the Store. A Store Guy / Admin / Owner (`store.write`) who raises it
 * accepts it on the spot. Accepting reverses the stock into the store on BOTH books (inventory ledger + storekeeper's
 * book) in one transaction, linked back on the return row. Everything is audited.
 */

function nextReturnNumber(attempt = 0): string {
  const now = new Date();
  const ms = String(Date.now() + attempt * 7919 + Math.floor(Math.random() * 97)).slice(-5);
  return `RTN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${ms}`;
}

const INCLUDE = {
  item: { select: { id: true, code: true, name: true, unit: true } },
  order: { select: { id: true, orderNumber: true } },
} as const;

type ReturnDb = Pick<typeof db, 'misInventoryLedger' | 'misStoreReturn'>;

/**
 * How much of an item may still come back: what was issued (to that order, when one is named) less what has already
 * been returned. A return can never put more into the store than left it. `statuses` names which earlier returns count
 * against it — at raise time a PENDING one does too (so two open returns cannot both claim the same issue); at accept
 * time only ACCEPTED ones, excluding the return being decided.
 */
async function returnableQty(
  client: ReturnDb,
  itemId: string,
  orderId: string | null,
  statuses: ('PENDING' | 'ACCEPTED')[],
  excludeId?: string,
): Promise<number> {
  const [issued, returned] = await Promise.all([
    client.misInventoryLedger.aggregate({ where: { itemId, source: 'STORE_ISSUE', ...(orderId ? { sourceId: orderId } : {}) }, _sum: { changeQty: true } }),
    client.misStoreReturn.aggregate({
      where: { itemId, status: { in: statuses }, ...(orderId ? { orderId } : {}), ...(excludeId ? { id: { not: excludeId } } : {}) },
      _sum: { quantity: true },
    }),
  ]);
  const out = -Number(issued._sum.changeQty ?? 0);
  const back = Number(returned._sum.quantity ?? 0);
  return round2(Math.max(0, out - back));
}

function assertReturnable(qty: number, returnable: number, orderId: string | null) {
  if (qty > returnable) {
    throw new Error(`Cannot return ${qty}: only ${returnable} ${orderId ? 'was issued to that order' : 'was issued'} and not yet returned.`);
  }
}

export type StoreReturnInput = { itemId: string; qty: number; reason: string; orderId?: string | null };

export async function createStoreReturn(input: StoreReturnInput) {
  const actor = await requirePermission('store.read');
  const { qty, reason } = validateReturn({ qty: input.qty, reason: input.reason });
  const item = await db.misItem.findFirst({ where: { id: input.itemId, isActive: true, deletedAt: null }, select: { id: true, name: true } });
  if (!item) throw new Error('Item not found or inactive');
  if (input.orderId) {
    const order = await db.misOrder.findUnique({ where: { id: input.orderId }, select: { id: true } });
    if (!order) throw new Error('That order no longer exists — reload and pick again.');
  }
  assertReturnable(qty, await returnableQty(db, input.itemId, input.orderId ?? null, ['PENDING', 'ACCEPTED']), input.orderId ?? null);
  let created;
  for (let attempt = 0; ; attempt++) {
    try {
      created = await db.misStoreReturn.create({
        data: { returnNumber: nextReturnNumber(attempt), itemId: input.itemId, quantity: qty, reason, orderId: input.orderId ?? null, returnedById: actor.userId },
      });
      break;
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt >= 5) throw err;
    }
  }
  await logAuditEvent({
    actorId: actor.userId, action: 'store_return.create', entity: 'MisStoreReturn', entityId: created.id,
    after: { returnNumber: created.returnNumber, itemId: input.itemId, quantity: String(qty), reason, orderId: input.orderId ?? null },
  });
  if (returnStartsAccepted(can(actor.role, 'store.write'))) {
    await acceptReturn(created.id, actor.userId, null);
  }
  return { id: created.id, returnNumber: created.returnNumber };
}

/** Books the stock back in (both books, one transaction) and flips PENDING -> ACCEPTED on the same transaction. */
async function acceptReturn(id: string, actorId: string, note: string | null) {
  const ret = await db.misStoreReturn.findUnique({ where: { id }, include: { item: { select: { name: true } } } });
  if (!ret) throw new Error('Return not found');
  if (ret.status !== 'PENDING') throw new Error(RETURN_ALREADY_DECIDED);
  const qty = ret.quantity.toNumber();
  const zone = await storeFactoryZone();
  const done = await db.$transaction(async (tx) => {
    const claimed = await tx.misStoreReturn.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'ACCEPTED', decidedById: actorId, decidedAt: new Date(), decisionNote: note } });
    if (claimed.count !== 1) throw new Error(RETURN_ALREADY_DECIDED);
    await lockStockKeys(tx, [itemLockKey(ret.itemId), STXN_SEQ_KEY]);
    // Under the item lock, so two accepts cannot both pass against the same issued quantity.
    assertReturnable(qty, await returnableQty(tx, ret.itemId, ret.orderId ?? null, ['ACCEPTED'], id), ret.orderId ?? null);
    const ledgerBalance = await lastLedgerBalance(tx, ret.itemId);
    const txnBalance = await lastTxnBalance(tx, ret.itemId);
    const ledger = await tx.misInventoryLedger.create({
      data: { itemId: ret.itemId, changeQty: qty, balanceQty: round2(ledgerBalance + qty), source: 'STORE_RETURN', sourceId: id, notes: `${ret.returnNumber} · ${ret.reason}` },
    });
    const { prefix, next } = await nextTxnSeq(tx, zone);
    const txn = await tx.misStoreTransaction.create({
      data: {
        txnNumber: txnNumberOf(prefix, next), itemId: ret.itemId, type: 'IN', quantity: qty, balanceQty: round2(txnBalance + qty),
        referenceNo: ret.returnNumber, reason: `Return from floor · ${ret.reason}`, isOverIssue: false, createdById: actorId,
      },
    });
    await tx.misStoreReturn.update({ where: { id }, data: { ledgerId: ledger.id, storeTxnId: txn.id } });
    return { ledgerId: ledger.id, storeTxnId: txn.id, newBalance: round2(ledgerBalance + qty) };
  });
  await logAuditEvent({
    actorId, action: 'store_return.accept', entity: 'MisStoreReturn', entityId: id,
    before: { status: 'PENDING' }, after: { status: 'ACCEPTED', quantity: String(qty), newBalance: String(done.newBalance), ledgerId: done.ledgerId, storeTxnId: done.storeTxnId },
  });
}

/** The Store decides a PENDING return: accept books the stock back in; reject needs a reason and moves nothing. */
export async function decideStoreReturn(id: string, decision: 'ACCEPT' | 'REJECT', note?: string | null) {
  const actor = await requirePermission('store.write');
  if (decision === 'ACCEPT') {
    await acceptReturn(id, actor.userId, note?.trim() || null);
    return;
  }
  if (!note?.trim()) throw new Error('A reason is required to reject a return.');
  const claimed = await db.misStoreReturn.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', decidedById: actor.userId, decidedAt: new Date(), decisionNote: note.trim() } });
  if (claimed.count !== 1) throw new Error(RETURN_ALREADY_DECIDED);
  await logAuditEvent({ actorId: actor.userId, action: 'store_return.reject', entity: 'MisStoreReturn', entityId: id, before: { status: 'PENDING' }, after: { status: 'REJECTED', reason: note.trim() } });
}

export async function listStoreReturns() {
  await requirePermission('store.read');
  return db.misStoreReturn.findMany({ include: INCLUDE, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 });
}
