import { CLOSED_ORDER_STATUSES, isOrderClosed, REOPENED_ORDER_STATUS } from '@/lib/mis/order-status';
import {
  canOverrideCloseGates, canTransitionOrder, evaluateCloseGates, isOrderStatus, MIN_REASON_LENGTH, transitionNeedsReason, unmetGates, type CloseGate,
} from '@/lib/mis/order-transitions';
import { dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import type { Prisma } from '@/generated/prisma/client';
import { pageQuery, parseSearch, type Paged } from '@/lib/mis/pagination';
import { db } from '@/server/db';
import { flushReleaseAudit, releaseMachineAllocations, type ReleaseAuditEvent } from '@/server/mis/allocation-release';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

const humanStatus = (s: string) => s.toLowerCase().replace(/_/g, ' ');

export type OrderInput = {
  customerId?: string | null;
  description?: string | null;
  deliveryDate?: string | null;
  notes?: string | null;
};

/**
 * `attempt` (MIS-111, F-38) — two `createOrder` calls landing in the same millisecond (two
 * people double-tapping "New order", a batch import) derive the identical number from the clock
 * and the second write throws the `orderNumber` unique-constraint violation. `attempt` is 0 on
 * the first try and offsets the number on every retry below, so a collision does not need the
 * clock to tick before the next attempt succeeds.
 */
function nextOrderNumber(attempt = 0): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const ms = String(Date.now() + attempt * 7919 + Math.floor(Math.random() * 97)).slice(-5);
  return `ORD-${y}${m}-${ms}`;
}

export function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002');
}

/** R2-83: one page of orders (25); `q` matches the order number, customer or description; `customerId` narrows to one customer. */
export async function listOrdersPage(opts: { q?: string; customerId?: string; page?: number | string } = {}): Promise<Paged<Awaited<ReturnType<typeof listOrders>>[number]>> {
  await requirePermission('orders.read');
  const q = parseSearch(opts.q);
  const where: Prisma.MisOrderWhereInput = {
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const { skip, take } = pageQuery(opts.page);
  const [rows, total] = await Promise.all([
    db.misOrder.findMany({ where, include: { customer: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    db.misOrder.count({ where }),
  ]);
  return { rows, total };
}

export async function listOrders() {
  await requirePermission('orders.read');
  return db.misOrder.findMany({
    include: { customer: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getOrder(id: string) {
  await requirePermission('orders.read');
  return db.misOrder.findUnique({
    where: { id },
    include: { customer: true },
  });
}

export async function createOrder(input: OrderInput) {
  const actor = await requirePermission('orders.write');

  let created;
  const MAX_ATTEMPTS = 6;
  for (let attempt = 0; ; attempt++) {
    try {
      created = await db.misOrder.create({
        data: {
          orderNumber: nextOrderNumber(attempt),
          customerId: input.customerId || null,
          description: input.description?.trim() || null,
          deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
          notes: input.notes?.trim() || null,
          createdById: actor.userId,
        },
      });
      break;
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
      // A collided order number is a clock coincidence, not a programming error — propose
      // another one and try again rather than surfacing a raw constraint violation.
    }
  }
  await logAuditEvent({ actorId: actor.userId, action: 'order.create', entity: 'MisOrder', entityId: created.id, after: created });
  return created;
}

export async function updateOrder(id: string, input: OrderInput) {
  const actor = await requirePermission('orders.write');
  const before = await db.misOrder.findUnique({ where: { id } });
  if (!before) throw new Error(`Order ${id} not found`);
  // R3 B106: a closed order is edited only after a reasoned reopen.
  if (isOrderClosed(before.status)) {
    throw new Error(`Order ${before.orderNumber} is ${humanStatus(before.status)}. Reopen it first.`);
  }
  const after = await db.misOrder.update({
    where: { id },
    data: {
      customerId: input.customerId !== undefined ? (input.customerId || null) : undefined,
      description: input.description !== undefined ? (input.description?.trim() || null) : undefined,
      deliveryDate: input.deliveryDate !== undefined ? (input.deliveryDate ? new Date(input.deliveryDate) : null) : undefined,
      notes: input.notes !== undefined ? (input.notes?.trim() || null) : undefined,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'order.update', entity: 'MisOrder', entityId: id, before, after });
  return after;
}

/**
 * A status change that was refused for a reason the person can act on (unknown status,
 * illegal transition, unmet close gates, missing reason). A distinct class, like
 * `OrderReopenError`, so the server action can return the message as data while a database
 * error stays an exception. `reason` is what callers branch on.
 */
export type OrderStatusRefusal = 'OPEN_ITEMS' | 'UNKNOWN_STATUS' | 'ILLEGAL_TRANSITION' | 'REASON_REQUIRED' | 'STALE_STATUS' | 'GATES_UNMET' | 'OVERRIDE_NOT_ALLOWED';

export class OrderStatusError extends Error {
  constructor(
    readonly reason: OrderStatusRefusal,
    message: string,
    readonly gates?: CloseGate[],
    readonly openItems?: string[],
  ) {
    super(message);
    this.name = 'OrderStatusError';
  }
}

export function isOrderStatusError(error: unknown): error is OrderStatusError {
  return error instanceof OrderStatusError || (error as Error)?.name === 'OrderStatusError';
}

/** The close gates for one order, computed from its phases and QC checks. Read-only. */
export async function getOrderCloseGates(orderId: string): Promise<CloseGate[]> {
  await requirePermission('orders.read');
  return computeCloseGates(orderId);
}

async function computeCloseGates(orderId: string): Promise<CloseGate[]> {
  const [phases, qcChecks, productionCount] = await Promise.all([
    db.misJobPhase.findMany({ where: { orderId, deletedAt: null }, select: { status: true } }),
    db.misQcCheck.findMany({ where: { orderId, voidedAt: null }, select: { bomStageId: true, parameterName: true, result: true, checkTime: true } }),
    db.misProductionLog.count({ where: { orderId, voidedAt: null } }),
  ]);
  return evaluateCloseGates({ phases, qcChecks, productionCount });
}

export type CloseOverrideNote = { reason: string; at: Date };

/** The most recent "completed past unmet gates" override on an order, for display. */
export async function getOrderCloseOverride(orderId: string): Promise<CloseOverrideNote | null> {
  await requirePermission('orders.read');
  const rows = await db.misAuditLog.findMany({
    where: { entity: 'MisOrder', entityId: orderId, action: 'order.status_change' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { after: true, createdAt: true },
  });
  for (const row of rows) {
    const after = row.after as { status?: string; reason?: string; gatesOverridden?: unknown } | null;
    if (after?.status === 'COMPLETED' && after.gatesOverridden && after.reason) return { reason: after.reason, at: row.createdAt };
  }
  return null;
}


/**
 * Move an order along ORDER_TRANSITIONS. `reason` is required to cancel, and is the override
 * reason when completing past unmet close gates (OWNER/ADMIN only). Reopening a closed order
 * is `reopenOrder`, not this.
 */
export async function updateOrderStatus(id: string, status: string, options: { reason?: string; confirmOpenItems?: boolean } = {}) {
  const actor = await requirePermission('orders.write');
  const before = await db.misOrder.findUnique({ where: { id } });
  if (!before) throw new Error(`Order ${id} not found`);

  if (!isOrderStatus(status)) {
    throw new OrderStatusError('UNKNOWN_STATUS', `"${status}" is not an order status.`);
  }
  if (!canTransitionOrder(before.status, status)) {
    throw new OrderStatusError(
      'ILLEGAL_TRANSITION',
      `${before.orderNumber} is ${humanStatus(before.status)} and cannot go to ${humanStatus(status)}.`,
    );
  }

  const reason = options.reason?.trim() ?? '';
  let overriddenGates: CloseGate[] | undefined;

  if (transitionNeedsReason(before.status, status) && reason.length < MIN_REASON_LENGTH) {
    throw new OrderStatusError('REASON_REQUIRED', status === 'CANCELLED' ? 'Cancelling an order needs a reason.' : 'Sending a completed order back to production needs a reason.');
  }
  if (status === 'COMPLETED') {
    const unmet = unmetGates(await computeCloseGates(id));
    if (unmet.length > 0) {
      if (!canOverrideCloseGates(actor.role)) {
        throw new OrderStatusError('OVERRIDE_NOT_ALLOWED', `${before.orderNumber} cannot be completed yet: ${unmet.map((g) => g.detail).join('; ')}. An owner or admin can override.`, unmet);
      }
      if (reason.length < MIN_REASON_LENGTH) {
        throw new OrderStatusError('GATES_UNMET', `${before.orderNumber} has unmet gates: ${unmet.map((g) => g.detail).join('; ')}. Give a reason to complete it anyway.`, unmet);
      }
      overriddenGates = unmet;
    }
  }

  // R3 B104: cancelling with a BOM awaiting approval or an open material request needs a
  // deliberate "cancel anyway"; the open items are listed so the person can see what dies.
  let openBomId: string | null = null;
  let openRequests: { id: string; requestNumber: string }[] = [];
  if (status === 'CANCELLED') {
    const [bom, requests] = await Promise.all([
      db.misBom.findUnique({ where: { orderId: id }, select: { id: true, status: true } }),
      db.misMaterialRequest.findMany({
        where: { orderId: id, status: { in: ['PENDING', 'APPROVED'] } },
        select: { id: true, requestNumber: true, status: true, lines: { select: { actualIssuedQty: true } } },
      }),
    ]);
    if (bom?.status === 'PENDING_APPROVAL') openBomId = bom.id;
    openRequests = requests.filter((r) => r.status === 'PENDING' || r.lines.every((l) => !l.actualIssuedQty || Number(l.actualIssuedQty) === 0));
    const items = [
      ...(openBomId ? ['BOM waiting for approval'] : []),
      ...openRequests.map((r) => `Material request ${r.requestNumber}`),
    ];
    if (items.length > 0 && options.confirmOpenItems !== true) {
      throw new OrderStatusError('OPEN_ITEMS', `${before.orderNumber} still has open items: ${items.join('; ')}. Cancel anyway to drop them.`, undefined, items);
    }
  }

  // Compare-and-set on the status we validated against: two people acting on the same screen
  // must not both pass the transition check and then both write. For CANCELLED and COMPLETED the
  // machine/crew release and the stock-reservation release commit in the SAME transaction, so a
  // failure in any of them leaves the status unchanged. (The audit write stays outside: it uses
  // the shared client and must never fail a save.)
  const closes = status === 'CANCELLED' || status === 'COMPLETED';
  const at = new Date();
  let releaseAudit: ReleaseAuditEvent[] = [];
  const released = { releasedMachines: 0, releasedWorkers: 0, releasedReservations: 0 };
  await db.$transaction(async (tx) => {
    const { count } = await tx.misOrder.updateMany({ where: { id, status: before.status }, data: { status } });
    if (count === 0) {
      throw new OrderStatusError('STALE_STATUS', `${before.orderNumber} was changed by someone else. Refresh and try again.`);
    }
    if (!closes) return;
    const bookings = await tx.misMachineAllocation.findMany({ where: { orderId: id, releasedAt: null }, select: { id: true } });
    const freed = await releaseMachineAllocations(tx, bookings.map((b) => b.id), { reason: 'ORDER_CLOSED', actorUserId: actor.userId, at });
    releaseAudit = freed.auditEvents;
    released.releasedMachines = freed.machines;
    released.releasedWorkers = freed.workers;
    if (status === 'CANCELLED') {
      // No released marker exists, so releasing a reservation removes the earmark row. Only on
      // CANCELLED: COMPLETED -> IN_PRODUCTION is reversible, so there the rows are just counted.
      released.releasedReservations = (await tx.misOrderStockAllocation.deleteMany({ where: { orderId: id } })).count;
      if (openBomId) {
        await tx.misBom.updateMany({ where: { id: openBomId, status: 'PENDING_APPROVAL' }, data: { status: 'DRAFT', approvedById: null, approvedAt: null } });
      }
      if (openRequests.length > 0) {
        await tx.misMaterialRequest.updateMany({
          where: { id: { in: openRequests.map((r) => r.id) }, status: { in: ['PENDING', 'APPROVED'] } },
          data: { status: 'REJECTED', decidedById: actor.userId, decidedAt: at, decisionNote: `Order ${before.orderNumber} cancelled` },
        });
      }
    } else {
      released.releasedReservations = await tx.misOrderStockAllocation.count({ where: { orderId: id } });
    }
  });
  // Audit rows use the global client, so they are written only after the transaction committed.
  await flushReleaseAudit(releaseAudit);
  if (status === 'CANCELLED') {
    if (openBomId) await logAuditEvent({ actorId: actor.userId, action: 'order.cancel_bom_reset', entity: 'MisBom', entityId: openBomId, before: { status: 'PENDING_APPROVAL' }, after: { status: 'DRAFT', reason: `Order ${before.orderNumber} cancelled` } });
    for (const r of openRequests) {
      await logAuditEvent({ actorId: actor.userId, action: 'order.cancel_request_closed', entity: 'MisMaterialRequest', entityId: r.id, after: { status: 'REJECTED', reason: `Order ${before.orderNumber} cancelled` } });
    }
  }
  const after = { ...before, status };
  await logAuditEvent({
    actorId: actor.userId,
    action: 'order.status_change',
    entity: 'MisOrder',
    entityId: id,
    before,
    after: {
      ...after,
      ...(reason ? { reason } : {}),
      ...(closes ? released : {}),
      ...(overriddenGates ? { gatesOverridden: overriddenGates.map((g) => ({ key: g.key, detail: g.detail })) } : {}),
    },
  });
  return after;
}

/**
 * A reopen that was refused for a reason the person can act on. A distinct class
 * so the server action can return its message as data while letting anything
 * unexpected — a database error — stay an exception: returning `error.message`
 * for *every* failure would hand internals to the browser.
 */
export class OrderReopenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderReopenError';
  }
}

/**
 * Put a closed order back in play — the route through D14's refusal.
 *
 * A closed order refuses production, and a refusal with no way through is a
 * dead end: a legitimate late correction would send somebody to edit the
 * database by hand. This deliberately mirrors `reopenPhase` in job-phases.ts —
 * reason required, audited, and the *only* thing that lets a parked write
 * replay — so the whole system has one mental model for every hold: the world
 * must change before the write lands, and a named person changes it on the
 * record (Appendix B §B.5.4).
 *
 * `orders.write`, not Owner-only: anyone who holds it can already move an
 * order's status freely through `updateOrderStatus` with no reason at all, and
 * making the documented, reasoned path stricter than the undocumented one would
 * push people toward the worse route (D14).
 */
export async function reopenOrder(id: string, reason: string) {
  const actor = await requirePermission('orders.write');
  const trimmed = reason?.trim();
  if (!trimmed) throw new OrderReopenError('Reopening an order needs a reason.');

  const before = await db.misOrder.findUnique({ where: { id } });
  if (!before) throw new OrderReopenError(`Order ${id} not found`);
  if (!isOrderClosed(before.status)) {
    throw new OrderReopenError(`${before.orderNumber} is ${before.status.toLowerCase().replace(/_/g, ' ')}, so there is nothing to reopen.`);
  }

  const after = await db.misOrder.update({ where: { id }, data: { status: REOPENED_ORDER_STATUS } });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'order.reopen',
    entity: 'MisOrder',
    entityId: id,
    before: { status: before.status },
    after: { status: after.status, reason: trimmed },
  });
  return after;
}

export type OrderNeedingAction = {
  id: string;
  orderNumber: string;
  customerName: string | null;
  status: string;
  /** What the reader has to do next, in words. Never "needs attention". */
  nextAction: string;
  lateRisk: boolean;
  deliveryDate: Date | null;
  daysToDelivery: number | null;
};


/**
 * Open orders with the next concrete step spelled out.
 *
 * Sorted so anything at risk of missing its delivery date floats to the top —
 * the admin home is a worklist, not a table of everything.
 */
export async function listOrdersNeedingAction(limit = 5): Promise<OrderNeedingAction[]> {
  await requirePermission('orders.read');

  const orders = await db.misOrder.findMany({
    where: { status: { notIn: [...CLOSED_ORDER_STATUSES] } },
    include: {
      customer: { select: { name: true } },
      bom: { select: { status: true } },
      _count: { select: { productionLogs: { where: { voidedAt: null } } } },
    },
    orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  });

  const timeZone = await getFactoryTimezone();
  const todayKey = factoryDateKey(new Date(), timeZone);
  const DAY = 24 * 60 * 60 * 1000;
  const today = dateKeyToDbDate(todayKey).getTime();

  const rows = orders.map((o) => {
    // deliveryDate is a calendar date (UTC midnight); compare date keys, never clock hours.
    const daysToDelivery = o.deliveryDate
      ? Math.round((dateKeyToDbDate(o.deliveryDate.toISOString().slice(0, 10)).getTime() - today) / DAY)
      : null;

    let nextAction: string;
    if (o.status === 'DRAFT') nextAction = 'Confirm the order';
    else if (!o.bom) nextAction = 'Create the BOM';
    else if (o.bom.status === 'DRAFT') nextAction = 'Send the BOM for approval';
    else if (o.bom.status === 'PENDING_APPROVAL') nextAction = 'Waiting on BOM approval';
    else if (o._count.productionLogs === 0) nextAction = 'Issue the job card';
    else nextAction = 'Log today’s production';

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer?.name ?? null,
      status: o.status,
      nextAction,
      lateRisk: daysToDelivery !== null && daysToDelivery <= 3,
      deliveryDate: o.deliveryDate,
      daysToDelivery,
    };
  });

  rows.sort((a, b) => {
    if (a.lateRisk !== b.lateRisk) return a.lateRisk ? -1 : 1;
    const ad = a.daysToDelivery ?? Number.MAX_SAFE_INTEGER;
    const bd = b.daysToDelivery ?? Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });

  return rows.slice(0, limit);
}
