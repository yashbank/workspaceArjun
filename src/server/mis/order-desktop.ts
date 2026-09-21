/**
 * The desktop order detail (D4), assembled from the phone layer's server functions.
 *
 * A SECOND VIEW OF THE SAME DATA, never a second data path: every fact below comes from a
 * function the phone screens already call — the order, its phases, the production logs, the QC
 * checks, the documents, the BOM, the machine schedule and the shift. This module only
 * composes them and turns them into the plain shape `OrderDesktopData` describes.
 *
 * **No money.** D4 is explicit — "not order value, not material cost, not a margin" — so this
 * asks for none. It calls `getBom`, which itself removes the rate for a role without
 * `wages.read` (F-06), and then copies ONLY description, quantity and unit out of it: the rate
 * is dropped here even for an Owner, because this screen has nowhere to show it and a payload
 * should carry only what is drawn. The rupee lives on the costing overlay (D6).
 */

import type { OrderDesktopData, PhaseRowView, BlockerView } from '@/lib/mis/order-desktop';
import {
  activePhase,
  daysUntil,
  hourlyQcStrip,
  phaseFigures,
  phasePosition,
  phaseProgress,
  phaseStates,
  qcSummary,
  type PhaseStatus,
} from '@/lib/mis/order-timeline';
import { can } from '@/lib/mis/permissions';
import { formatFactoryTime, factoryDateKey } from '@/lib/mis/factory-time';

import { requirePermission } from './auth';
import { getBom } from './bom';
import { getFactoryTimezone } from './business-rules';
import { listDocuments } from './documents';
import { getPhasesForOrder, getSignOffSummary, type SignOffBlocker } from './job-phases';
import { getOrderSchedule } from './machines-board';
import { getOrder } from './orders';
import { getProductionForOrder } from './production';
import { getQcForOrder } from './qc';
import { getFactoryShiftWindow } from './shift-view';

const dayMonth = (d: Date, timeZone: string) => {
  const key = factoryDateKey(d, timeZone); // YYYY-MM-DD in the FACTORY's day (D22)
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
};

function blockerView(blocker: SignOffBlocker, timeZone: string): BlockerView {
  if (blocker.kind === 'QC_FAILURE') {
    return { kind: 'QC_FAILURE', parameter: blocker.parameterName, timeLabel: formatFactoryTime(blocker.checkTime, timeZone) };
  }
  if (blocker.kind === 'WASTE_REASON') {
    return { kind: 'WASTE_REASON', qtyWaste: blocker.qtyWaste, timeLabel: formatFactoryTime(blocker.loggedAt, timeZone) };
  }
  return { kind: 'NO_PRODUCTION' };
}

export async function getOrderDesktopView(orderId: string, now: Date = new Date()): Promise<OrderDesktopData | null> {
  const actor = await requirePermission('orders.read');

  const order = await getOrder(orderId);
  if (!order) return null;

  const [phases, bom, qcChecks, docs, logs, schedule, shift, timeZone] = await Promise.all([
    getPhasesForOrder(orderId),
    getBom(orderId),
    getQcForOrder(orderId),
    listDocuments(orderId),
    getProductionForOrder(orderId),
    getOrderSchedule(orderId),
    getFactoryShiftWindow(now),
    getFactoryTimezone(),
  ]);

  const inputs = phases.map((p) => ({ id: p.id, sequence: p.sequence, status: p.status as PhaseStatus }));
  const states = phaseStates(inputs);
  const active = activePhase(inputs);

  // Only the ACTIVE phase carries a sign-off summary (its blockers, its hand-over figure). One
  // call, not one per phase — and only when something is actually running.
  const summary = active ? await getSignOffSummary(active.id) : null;

  const rows: PhaseRowView[] = phases.map((p) => {
    const slot = schedule.get(p.id);
    const isActive = active?.id === p.id;
    const figures = phaseFigures(logs, p.id);
    const detail = [
      slot?.machineName,
      p.inCharge?.name,
      slot && slot.operators > 0 ? `${slot.operators} operator${slot.operators === 1 ? '' : 's'}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      id: p.id,
      sequence: p.sequence,
      name: p.process.name,
      nameHi: p.process.nameHi ?? null,
      state: states.get(p.id)!,
      detail,
      signedAtLabel: p.signedOffAt ? formatFactoryTime(p.signedOffAt, timeZone) : null,
      startedAtLabel: p.startedAt ? formatFactoryTime(p.startedAt, timeZone) : null,
      plannedEndLabel: slot ? formatFactoryTime(slot.endsAt, timeZone) : null,
      figures:
        isActive && figures.entries > 0
          ? { produced: figures.produced, waste: figures.waste, handedOver: summary?.handedOver?.output ?? null, unit: summary?.unit ?? 'KG' }
          : null,
      blockers: isActive && summary ? summary.blockers.map((b) => blockerView(b, timeZone)) : [],
    };
  });

  const position = phasePosition(inputs, active?.id ?? null);
  const activeRow = rows.find((r) => r.id === active?.id);

  // The sign-off action. `canSign` is false whenever a blocker exists, but D4 wants the button
  // present and EXPLAINING ("rather than silently failing"), so a person who holds phase.write
  // keeps it while blocked; the sign-off screen itself still refuses anyone but the in-charge
  // (D12). Absent, not disabled, for everyone else.
  const signOff =
    active && summary && (summary.canSign || (summary.blockers.length > 0 && can(actor.role, 'phase.write')))
      ? { phaseId: active.id, name: summary.processName, blockedReasons: summary.blockers.length }
      : null;

  const strip = shift
    ? hourlyQcStrip(qcChecks, { startMinute: shift.startMinute, endMinute: shift.endMinute }, now, shift.dateKey, timeZone)
    : [];
  const quality = qcSummary(qcChecks);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    description: order.description ?? null,
    customer: order.customer?.name ?? null,
    status: order.status,
    receivedLabel: dayMonth(order.createdAt, timeZone),
    deliveryLabel: order.deliveryDate ? dayMonth(order.deliveryDate, timeZone) : null,
    daysLeft: daysUntil(order.deliveryDate, now, timeZone),
    progress: phaseProgress(inputs),
    position: position && activeRow ? { ...position, name: activeRow.name } : null,
    phases: rows,
    signOff,
    quality: {
      strip,
      shiftLabel: shift?.name ?? null,
      taken: quality.taken,
      passed: quality.passed,
      openDefect: quality.openDefect ? { parameter: quality.openDefect.parameter, defectType: quality.openDefect.defectType } : null,
    },
    documents: docs.map((d) => ({
      id: d.id,
      name: d.name,
      meta: [
        d.mimeType?.split('/')[1]?.toUpperCase() ?? null,
        d.fileSize ? `${Math.max(1, Math.round(d.fileSize / 1024))} KB` : null,
        dayMonth(d.createdAt, timeZone).slice(0, 5),
      ]
        .filter(Boolean)
        .join(' · '),
    })),
    bom: bom
      ? {
          statusLabel: bom.status,
          items: bom.stages.flatMap((stage) =>
            stage.materials.map((m) => ({
              id: m.id,
              description: m.description,
              quantity: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(m.quantity)),
              unit: m.unit,
            })),
          ),
        }
      : null,
  };
}
