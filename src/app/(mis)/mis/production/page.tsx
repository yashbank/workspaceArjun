import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { CLOSED_ORDER_STATUSES } from '@/lib/mis/order-status';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { ProductionScreen } from '@/components/mis/production/production-screen';
import { requirePermission } from '@/server/mis/auth';

export default async function ProductionPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'production.write');

  await requirePermission('production.read');
  const [orders, machines] = await Promise.all([
    db.misOrder.findMany({
      // The same closed-status list the server refuses on (D14). This used to omit
      // COMPLETED, so the screen offered an order the write would then reject.
      where: { status: { notIn: [...CLOSED_ORDER_STATUSES, 'DRAFT'] } },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { productionLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.misMachine.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <ProductionScreen
      orders={orders}
      machines={machines}
      canWrite={canWrite}
      userId={user.id}
      // Rendered now. Offline, the screen shows this back as "lists as of HH:MM"
      // (D16) — the cached copy of this page is the only source it has.
      loadedAt={new Date().toISOString()}
    />
  );
}
