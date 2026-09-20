import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { QcGridScreen } from '@/components/mis/qc/qc-grid-screen';
import { db } from '@/server/db';

async function getTodayQcChecks() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return db.misQcCheck.findMany({
    where: { checkTime: { gte: today, lt: tomorrow } },
    include: {
      order: { select: { orderNumber: true } },
    },
    orderBy: { checkTime: 'asc' },
  }).catch(() => []);
}

export default async function QcGridPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'qc.write');
  const orders = (await listOrders()).filter((o: any) => o.status === 'IN_PRODUCTION');
  const todayChecks = await getTodayQcChecks();
  
  return <QcGridScreen orders={orders as any[]} todayChecks={todayChecks as any[]} canWrite={canWrite} />;
}
