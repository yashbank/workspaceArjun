/**
 * D11's traceability: one search box, and what the records can honestly say about it.
 *
 * Search by an ORDER number (its chain: material → issued → order → phases → QC → despatch) or by a supplier
 * LOT / batch number (its receipts, and what the store issued of that item afterwards). It reuses the phone
 * layer's reads — `getPhasesForOrder`, `getQcForOrder`, the GRN and ledger tables the store already writes — and
 * adds only the composition and the person names.
 *
 * **What the records cannot say, this does not say.** The store does not record which lot an issue drew from, an
 * order has no despatch record, and there is no recall notice. So a step with nothing behind it is `none`, a step
 * this role may not read is `denied`, and there is no "Contained" verdict (F-21).
 *
 * **Per-step permissions.** The gate is `orders.read`; each step then needs its own permission (`grn.read`,
 * `store.read`, `phase.read`, `qc.read`) or is `denied` — a QC reader sees the phases and the QC results, not the
 * store. **No money:** nothing selected here carries a rate, price or total.
 * **Scoping:** orders are looked up through `resolveVisibleOrderWhere`, the one seam D4 will narrow.
 */

import { can } from '@/lib/mis/permissions';
import {
  EMPTY_TRACE,
  buildEvents,
  denied,
  none,
  normaliseQuery,
  ok,
  okOrNone,
  pairIssuer,
  personOrNull,
  stamp,
  stampDate,
  summariseQc,
  type IssueFact,
  type LotFacts,
  type LotIssuedTo,
  type MaterialItem,
  type PhaseFact,
  type TraceEventInput,
  type TraceView,
} from '@/lib/mis/trace';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { getPhasesForOrder } from '@/server/mis/job-phases';
import { getQcForOrder } from '@/server/mis/qc';
import { resolveVisibleOrderWhere } from '@/server/mis/visibility';

const n = (v: unknown) => Number(v ?? 0);
const RECEIPTS_PER_ITEM = 3;

/** userProfile ids → display names, in one query. An id with no profile is simply absent (shown as unknown). */
async function namesFor(ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const rows = await db.userProfile.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(rows.filter((r) => r.name).map((r) => [r.id, r.name as string]));
}

export async function getTraceView(input: { q?: unknown } = {}, now: Date = new Date()): Promise<TraceView> {
  const actor = await requirePermission('orders.read');
  const query = normaliseQuery(input.q);
  if (query === '') return EMPTY_TRACE('', 'idle');

  const timeZone = await getFactoryTimezone();
  const role = actor.role;

  // --- an order? -------------------------------------------------------------------------------
  const visible = await resolveVisibleOrderWhere(actor);
  const order = await db.misOrder.findFirst({
    where: { AND: [visible, { orderNumber: { equals: query, mode: 'insensitive' } }] },
    select: { id: true, orderNumber: true, description: true, status: true, deliveryDate: true, createdAt: true, createdById: true, customer: { select: { name: true } } },
  });
  // `equals` is exact, but the answer is verified anyway: a wildcard-looking search must never return a near miss.
  if (order && order.orderNumber.toLowerCase() === query.toLowerCase()) return orderTrace(order, role, timeZone, now, query);

  // --- otherwise a supplier lot? -----------------------------------------------------------------
  if (!can(role, 'grn.read')) return EMPTY_TRACE(query, 'none', true);
  return lotTrace(query, role, timeZone, now, visible);
}

type OrderRow = { id: string; orderNumber: string; description: string | null; status: string; deliveryDate: Date | null; createdAt: Date; createdById: string | null; customer: { name: string } | null };

async function orderTrace(order: OrderRow, role: Parameters<typeof can>[0], timeZone: string, now: Date, query: string): Promise<TraceView> {
  const mayGrn = can(role, 'grn.read');
  const mayStore = can(role, 'store.read');
  const mayPhase = can(role, 'phase.read');
  const mayQc = can(role, 'qc.read');

  // Fetch first, resolve names once, then build.
  const bom = mayGrn
    ? await db.misBom.findUnique({
        where: { orderId: order.id },
        // Description, quantity and unit only: a material's rate is money (D24) and is never selected.
        select: { stages: { select: { materials: { select: { itemId: true, description: true, quantity: true, unit: true, item: { select: { name: true, unit: true } } } } } } },
      })
    : null;
  const itemIds = [...new Set((bom?.stages ?? []).flatMap((s) => s.materials.map((m) => m.itemId)).filter((id): id is string => !!id))];

  const receiptRows = mayGrn && itemIds.length
    ? await db.misGrnItem.findMany({
        where: { poItem: { itemId: { in: itemIds } }, grn: { receivedAt: { not: null } } },
        select: { receivedQty: true, batchNo: true, poItem: { select: { itemId: true } }, grn: { select: { grnNumber: true, receivedAt: true, receivedById: true } } },
      })
    : [];

  const ledger = mayStore
    ? await db.misInventoryLedger.findMany({
        where: { source: 'STORE_ISSUE', sourceId: order.id },
        select: { itemId: true, changeQty: true, createdAt: true, item: { select: { name: true, unit: true } } },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const issueTxns = mayStore && ledger.length
    ? await db.misStoreTransaction.findMany({ where: { type: 'OUT', referenceNo: order.orderNumber }, select: { itemId: true, quantity: true, createdAt: true, createdById: true, isOverIssue: true } })
    : [];

  const phases = mayPhase ? await getPhasesForOrder(order.id) : null;
  const checks = mayQc ? await getQcForOrder(order.id) : null;

  const names = await namesFor([
    order.createdById,
    ...receiptRows.map((r) => r.grn.receivedById),
    ...issueTxns.map((t) => t.createdById),
    ...(phases ?? []).flatMap((p) => [p.startedById, p.signedOffById]),
  ]);
  const who = (id: string | null | undefined) => (id ? names.get(id) ?? null : null);

  const events: TraceEventInput[] = [{ at: order.createdAt, kind: 'ORDER_RAISED', subject: order.orderNumber, by: who(order.createdById) }];

  // --- 1 · material (item level: the lot an issue drew from is not recorded) ------------------------
  let material: TraceView['material'] = mayGrn ? none() : denied();
  if (mayGrn && bom) {
    const seen = new Map<string, MaterialItem>();
    for (const m of bom.stages.flatMap((s) => s.materials)) {
      const id = m.itemId ?? `desc:${m.description}`;
      if (seen.has(id)) continue;
      const mine = receiptRows
        .filter((r) => m.itemId !== null && r.poItem.itemId === m.itemId && r.grn.receivedAt)
        .sort((a, b) => (b.grn.receivedAt as Date).getTime() - (a.grn.receivedAt as Date).getTime())
        .slice(0, RECEIPTS_PER_ITEM);
      const unit = m.item?.unit ?? m.unit;
      seen.set(id, {
        name: m.item?.name ?? m.description,
        unit,
        receipts: mine.map((r) => ({ grnNumber: r.grn.grnNumber, batchNo: r.batchNo, qty: n(r.receivedQty), unit, receivedLabel: stamp(r.grn.receivedAt as Date, timeZone, now), by: who(r.grn.receivedById) })),
      });
      for (const r of mine) events.push({ at: r.grn.receivedAt as Date, kind: 'RECEIVED', subject: m.item?.name ?? m.description, qty: n(r.receivedQty), unit, by: who(r.grn.receivedById) });
    }
    material = okOrNone([...seen.values()]);
  }

  // --- 2 · issued to this order ---------------------------------------------------------------------
  let issues: TraceView['issues'] = mayStore ? none() : denied();
  if (mayStore) {
    const txns = issueTxns.map((t) => ({ itemId: t.itemId, quantity: n(t.quantity), at: t.createdAt, by: who(t.createdById), over: t.isOverIssue }));
    const used = new Set<number>();
    const lines: IssueFact[] = ledger.map((l) => {
      const qty = Math.abs(n(l.changeQty));
      const by = pairIssuer({ itemId: l.itemId, quantity: qty, at: l.createdAt }, txns, used);
      const over = txns.some((t) => t.itemId === l.itemId && Math.abs(t.quantity - qty) < 0.005 && t.over);
      events.push({ at: l.createdAt, kind: 'ISSUED', subject: l.item.name, qty, unit: l.item.unit, by });
      return { itemName: l.item.name, unit: l.item.unit, qty, atLabel: stamp(l.createdAt, timeZone, now), by, overIssue: over };
    });
    issues = okOrNone(lines);
  }

  // --- 4 · phases ---------------------------------------------------------------------------------------
  let phasesSection: TraceView['phases'] = mayPhase ? none() : denied();
  if (phases && phases.length > 0) {
    const rows: PhaseFact[] = phases.map((p) => {
      const startedBy = who(p.startedById);
      const signedBy = who(p.signedOffById);
      if (p.startedAt) events.push({ at: p.startedAt, kind: 'PHASE_STARTED', subject: p.process.name, by: startedBy });
      if (p.signedOffAt) events.push({ at: p.signedOffAt, kind: 'PHASE_SIGNED', subject: p.process.name, by: signedBy });
      return {
        seq: p.sequence,
        name: p.process.name,
        status: p.status,
        inCharge: p.inCharge?.name ?? null,
        startedLabel: p.startedAt ? stamp(p.startedAt, timeZone, now) : null,
        startedBy,
        signedLabel: p.signedOffAt ? stamp(p.signedOffAt, timeZone, now) : null,
        signedBy,
      };
    });
    phasesSection = ok({ done: rows.filter((r) => r.status === 'SIGNED_OFF').length, total: rows.filter((r) => r.status !== 'NOT_APPLICABLE').length, rows });
  }

  // --- 5 · QC -----------------------------------------------------------------------------------------------
  let qc: TraceView['qc'] = mayQc ? none() : denied();
  if (checks && checks.length > 0) {
    const summary = summariseQc(
      checks.map((c) => ({ id: c.id, bomStageId: c.bomStageId, parameterName: c.parameterName, result: c.result, defectType: c.defectType, checkTime: c.checkTime, by: personOrNull(c.checkBy?.name) })),
      timeZone,
      now,
    );
    for (const c of checks) {
      if (c.result !== 'FAIL') continue;
      events.push({ at: c.checkTime, kind: 'QC_FAILED', subject: c.parameterName ?? 'General', by: personOrNull(c.checkBy?.name) });
    }
    for (const f of summary.failures) {
      if (!f.cleared) continue;
      const failed = checks.find((c) => c.id === f.id)!;
      const later = checks
        .filter((c) => c.result === 'PASS' && c.bomStageId === failed.bomStageId && (c.parameterName ?? 'General') === (failed.parameterName ?? 'General') && c.checkTime > failed.checkTime)
        .sort((a, b) => a.checkTime.getTime() - b.checkTime.getTime())[0];
      if (later) events.push({ at: later.checkTime, kind: 'QC_CLEARED', subject: f.parameter, by: personOrNull(later.checkBy?.name) });
    }
    qc = ok(summary);
  }

  return {
    query,
    mode: 'order',
    lotDenied: false,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      description: order.description,
      customer: order.customer?.name ?? null,
      status: order.status,
      raisedLabel: stamp(order.createdAt, timeZone, now),
      raisedBy: who(order.createdById),
      deliveryLabel: order.deliveryDate ? stampDate(order.deliveryDate, timeZone) : null,
    },
    lot: null,
    material,
    issues,
    phases: phasesSection,
    qc,
    despatch: { status: order.status },
    events: buildEvents(events, timeZone, now),
  };
}

async function lotTrace(query: string, role: Parameters<typeof can>[0], timeZone: string, now: Date, visible: object): Promise<TraceView> {
  const found = await db.misGrnItem.findMany({
    where: { batchNo: { equals: query, mode: 'insensitive' } },
    select: {
      receivedQty: true,
      batchNo: true,
      poItem: { select: { itemId: true, item: { select: { name: true, unit: true } }, description: true } },
      grn: { select: { grnNumber: true, receivedAt: true, receivedById: true, po: { select: { poNumber: true, supplier: { select: { name: true } } } } } },
    },
  });
  // Verified exactly, as for an order: only a batch number that IS the search counts.
  const rows = found.filter((r) => (r.batchNo ?? '').toLowerCase() === query.toLowerCase());
  if (rows.length === 0) return EMPTY_TRACE(query, 'none');

  const names = await namesFor(rows.map((r) => r.grn.receivedById));
  const receipts = rows.map((r) => ({
    grnNumber: r.grn.grnNumber,
    poNumber: r.grn.po?.poNumber ?? null,
    supplier: r.grn.po?.supplier?.name ?? null,
    itemName: r.poItem.item?.name ?? r.poItem.description,
    unit: r.poItem.item?.unit ?? '',
    qty: n(r.receivedQty),
    receivedLabel: r.grn.receivedAt ? stamp(r.grn.receivedAt, timeZone, now) : null,
    by: r.grn.receivedById ? names.get(r.grn.receivedById) ?? null : null,
  }));
  const events: TraceEventInput[] = rows.filter((r) => r.grn.receivedAt).map((r) => ({
    at: r.grn.receivedAt as Date,
    kind: 'RECEIVED',
    subject: r.poItem.item?.name ?? r.poItem.description,
    qty: n(r.receivedQty),
    unit: r.poItem.item?.unit ?? null,
    by: r.grn.receivedById ? names.get(r.grn.receivedById) ?? null : null,
  }));

  // What the store issued of the same ITEM afterwards. The lot an issue drew from is not recorded, so this is
  // "could have used it", never "used it" — the screen says so.
  let issuedAfter: LotFacts['issuedAfter'] = denied();
  if (can(role, 'store.read')) {
    const itemIds = [...new Set(rows.map((r) => r.poItem.itemId).filter((id): id is string => !!id))];
    const since = rows.map((r) => r.grn.receivedAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
    const ledger = itemIds.length && since
      ? await db.misInventoryLedger.findMany({
          where: { source: 'STORE_ISSUE', itemId: { in: itemIds }, createdAt: { gte: since } },
          select: { itemId: true, changeQty: true, createdAt: true, sourceId: true, item: { select: { name: true, unit: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    // Through the same D4 seam as the search: an order this caller may not see is not named here either.
    const orderRows = ledger.length
      ? await db.misOrder.findMany({ where: { AND: [visible, { id: { in: [...new Set(ledger.map((l) => l.sourceId).filter((id): id is string => !!id))] } }] }, select: { id: true, orderNumber: true } })
      : [];
    const numberOf = new Map(orderRows.map((o) => [o.id, o.orderNumber]));
    const byItem = new Map<string, { itemName: string; unit: string; orders: Map<string, LotIssuedTo> }>();
    for (const l of ledger) {
      if (l.sourceId && !numberOf.has(l.sourceId)) continue; // booked to an order this caller may not see
      const entry = byItem.get(l.itemId) ?? { itemName: l.item.name, unit: l.item.unit, orders: new Map<string, LotIssuedTo>() };
      const key = l.sourceId ?? '—';
      const prev = entry.orders.get(key);
      entry.orders.set(key, { orderNumber: (l.sourceId && numberOf.get(l.sourceId)) || '—', orderId: l.sourceId && numberOf.has(l.sourceId) ? l.sourceId : null, qty: (prev?.qty ?? 0) + Math.abs(n(l.changeQty)), atLabel: stamp(l.createdAt, timeZone, now) });
      byItem.set(l.itemId, entry);
    }
    issuedAfter = okOrNone([...byItem.values()].map((e) => ({ itemName: e.itemName, unit: e.unit, orders: [...e.orders.values()] })));
  }

  return {
    ...EMPTY_TRACE(query, 'lot'),
    lot: { batchNo: rows[0].batchNo ?? query, receipts, issuedAfter },
    events: buildEvents(events, timeZone, now),
  };
}
