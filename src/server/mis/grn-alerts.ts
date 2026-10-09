import type { Prisma } from '@/generated/prisma/client';
import { grnAlertLines, grnPriceVariance, type GrnAlertPayload } from '@/lib/mis/grn-alert';
import { db } from '@/server/db';

import { requirePermission } from './auth';
import { formatMoney } from './po';

/**
 * V2 Epic 4 — the post-GRN alert to the office.
 *
 * Written on the same `notifications` table the QC-defect and phase-handover alerts use (no
 * second notification system), one row per OWNER / ADMIN login. The Owner's row carries the
 * price variance; the Admin's row never does (D24) — two payloads, not one payload hidden by a
 * screen. Read back on the role home, cleared when the GRN is opened.
 */

export const GRN_ALERT_TYPE = 'mis.grn_confirmed'; // = NOTIFICATION_TYPES.grnConfirmed (lib/mis/notification-copy.ts)

/** Called by `confirmGRN` after its transaction. Best-effort: an alert that cannot be written must not undo a receipt. */
export async function notifyGrnConfirmed(grnId: string): Promise<void> {
  try {
    const grn = await db.misGrn.findUnique({
      where: { id: grnId },
      include: {
        po: { select: { poNumber: true, supplier: { select: { name: true } } } },
        items: { include: { poItem: { select: { description: true, quantity: true, receivedQuantity: true, ratePerUnit: true } } } },
      },
    });
    if (!grn) return;
    const lines = grn.items.map((i) => ({
      description: i.poItem.description,
      ordered: i.poItem.quantity.toNumber(),
      received: i.receivedQty.toNumber(),
      receivedToDate: i.poItem.receivedQuantity.toNumber(),
      damaged: i.damageQuantity.toNumber(),
      short: i.shortQuantity?.toNumber() ?? null,
      ratePerUnit: i.poItem.ratePerUnit.toNumber(),
    }));
    const summary = grnAlertLines(lines);
    const variance = grnPriceVariance(lines, grn.supplierInvoiceAmount?.toNumber() ?? null);
    const base: GrnAlertPayload = {
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      poNumber: grn.po.poNumber,
      supplierName: grn.po.supplier?.name ?? null,
      confirmedAt: (grn.receivedAt ?? new Date()).toISOString(),
      ...summary,
    };
    // Only the Owner's copy knows about the invoice at all — including whether it disagrees (D24).
    const ownerPayload: GrnAlertPayload = variance
      ? {
          ...base,
          attention: base.attention || variance.variance !== 0,
          money: { receivedValue: formatMoney(variance.receivedValue), invoiced: formatMoney(variance.invoiced), variance: formatMoney(variance.variance) },
        }
      : base;

    const recipients = await db.userProfile.findMany({
      where: { status: 'active', misEmployee: { role: { in: ['OWNER', 'ADMIN'] }, isActive: true, deletedAt: null } },
      select: { id: true, misEmployee: { select: { role: true } } },
    });
    if (recipients.length === 0) return;
    await db.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        type: GRN_ALERT_TYPE,
        payload: (r.misEmployee?.role === 'OWNER' ? ownerPayload : base) as unknown as Prisma.InputJsonValue,
      })),
    });
  } catch (error) {
    console.error('[mis-grn] failed to write the GRN alert', { grnId, error });
  }
}

export type GrnAlertRow = GrnAlertPayload & { id: string; createdAt: Date };

/** The caller's unread GRN alerts, newest first. Owner and Admin only (`approvals.read`). */
export async function listGrnAlerts(limit = 5): Promise<GrnAlertRow[]> {
  const actor = await requirePermission('approvals.read');
  const rows = await db.notification.findMany({
    where: { userId: actor.userId, type: GRN_ALERT_TYPE, readAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((n) => ({ ...(n.payload as unknown as GrnAlertPayload), id: n.id, createdAt: n.createdAt }));
}

/** Opening a GRN clears the caller's own alert for it. Never touches another user's rows. */
export async function clearGrnAlertsFor(grnId: string): Promise<void> {
  const actor = await requirePermission('grn.read');
  await db.notification.updateMany({
    where: { userId: actor.userId, type: GRN_ALERT_TYPE, readAt: null, payload: { path: ['grnId'], equals: grnId } },
    data: { readAt: new Date() },
  });
}
