import { CLOSED_ORDER_STATUSES, isOrderClosed, REOPENED_ORDER_STATUS } from '@/lib/mis/order-status';
import { db } from '@/server/db';
import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

export type OrderInput = {
  customerId?: string | null;
  description?: string | null;
  deliveryDate?: string | null;
  notes?: string | null;
};

function nextOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const ms = String(Date.now()).slice(-5);
  return `ORD-${y}${m}-${ms}`;
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
  const created = await db.misOrder.create({
    data: {
      orderNumber: nextOrderNumber(),
      customerId: input.customerId || null,
      description: input.description?.trim() || null,
      deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
      notes: input.notes?.trim() || null,
      createdById: actor.userId,
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'order.create', entity: 'MisOrder', entityId: created.id, after: created });
  return created;
}

export async function updateOrder(id: string, input: OrderInput) {
  const actor = await requirePermission('orders.write');
  const before = await db.misOrder.findUnique({ where: { id } });
  if (!before) throw new Error(`Order ${id} not found`);
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

export async function updateOrderStatus(id: string, status: string) {
  const actor = await requirePermission('orders.write');
  const before = await db.misOrder.findUnique({ where: { id } });
  if (!before) throw new Error(`Order ${id} not found`);
  const after = await db.misOrder.update({ where: { id }, data: { status } });
  await logAuditEvent({ actorId: actor.userId, action: 'order.status_change', entity: 'MisOrder', entityId: id, before, after });
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
      _count: { select: { productionLogs: true } },
    },
    orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const DAY = 24 * 60 * 60 * 1000;

  const rows = orders.map((o) => {
    const daysToDelivery = o.deliveryDate
      ? Math.round((o.deliveryDate.getTime() - startOfToday.getTime()) / DAY)
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
