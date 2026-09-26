import { db } from '@/server/db';
import { can } from '@/lib/mis/permissions';
import { requirePermission } from '@/server/mis/auth';
import { getMisRole } from '@/server/mis/roles';
import { listExtraPayDays, type ExtraPayDayRow } from '@/server/mis/extra-pay-days';

export async function getPendingApprovals() {
  const actor = await requirePermission('orders.read');

  const [pendingBoms, pendingLeaves, pendingPos] = await Promise.all([
    db.misBom.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { order: { select: { id: true, orderNumber: true, description: true } } },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => []),

    db.misLeaveRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: { select: { name: true, employeeCode: true } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []),

    db.misPurchaseOrder.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []),
  ]);

  // Extra-pay days (25.4, D28) carry a rupee/multiplier figure, so they are folded in ONLY when
  // the caller already holds wages.read — every other role sharing this endpoint (Admin,
  // Supervisor, QC all hold orders.read) gets an empty list, never a redacted one, matching D24's
  // "the server does not send it" rule. The reused permission table (`getMisRole` here mirrors
  // what `requirePermission` already resolved for `actor`) keeps this a single extra query, not a
  // second gate that could disagree with the first.
  const role = await getMisRole(actor.userId);
  const pendingExtraPayDays: ExtraPayDayRow[] = can(role, 'wages.read')
    ? await listExtraPayDays('PENDING').catch(() => [])
    : [];

  return {
    boms: pendingBoms,
    leaves: pendingLeaves,
    pos: pendingPos,
    extraPayDays: pendingExtraPayDays,
    total: pendingBoms.length + pendingLeaves.length + pendingPos.length + pendingExtraPayDays.length,
  };
}
