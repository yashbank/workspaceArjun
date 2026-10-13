import { db } from '@/server/db';
import { can } from '@/lib/mis/permissions';
import { requirePermission } from '@/server/mis/auth';
import { getMisRole } from '@/server/mis/roles';
import { listExtraPayDays, type ExtraPayDayRow } from '@/server/mis/extra-pay-days';

export async function getPendingApprovals() {
  // F-13 fix: previously orders.read, which let QC/Supervisor see this inbox as a side effect
  // of holding order context. Approvals are Owner/Admin-only sign-off work.
  const actor = await requirePermission('approvals.read');

  // R3 B110: each query in its own try/catch; a failure is reported, never shown as "all caught up".
  const errors: string[] = [];
  const attempt = async <T>(kind: string, run: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await run();
    } catch {
      errors.push(`Could not load ${kind} approvals`);
      return [];
    }
  };

  const [pendingBoms, pendingLeaves, pendingPos] = await Promise.all([
    attempt('BOM', () => db.misBom.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { order: { select: { id: true, orderNumber: true, description: true } } },
      orderBy: { updatedAt: 'desc' },
    })),
    attempt('leave', () => db.misLeaveRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: { select: { name: true, employeeCode: true } } },
      orderBy: { createdAt: 'desc' },
    })),
    attempt('purchase order', () => db.misPurchaseOrder.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })),
  ]);

  // Extra-pay days (25.4, D28) carry a rupee/multiplier figure, so they are folded in ONLY when
  // the caller already holds wages.read — every other role sharing this endpoint (Admin,
  // Supervisor, QC all hold orders.read) gets an empty list, never a redacted one, matching D24's
  // "the server does not send it" rule. The reused permission table (`getMisRole` here mirrors
  // what `requirePermission` already resolved for `actor`) keeps this a single extra query, not a
  // second gate that could disagree with the first.
  const role = await getMisRole(actor.userId);
  const pendingExtraPayDays: ExtraPayDayRow[] = can(role, 'wages.read')
    ? await attempt('extra-pay day', () => listExtraPayDays('PENDING'))
    : [];

  return {
    boms: pendingBoms,
    leaves: pendingLeaves,
    pos: pendingPos,
    extraPayDays: pendingExtraPayDays,
    errors,
    total: pendingBoms.length + pendingLeaves.length + pendingPos.length + pendingExtraPayDays.length,
  };
}
