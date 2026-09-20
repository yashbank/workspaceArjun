import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';

export async function getPendingApprovals() {
  await requirePermission('orders.read');

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

  return {
    boms: pendingBoms,
    leaves: pendingLeaves,
    pos: pendingPos,
    total: pendingBoms.length + pendingLeaves.length + pendingPos.length,
  };
}
