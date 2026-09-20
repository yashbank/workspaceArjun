import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { QcScreen } from '@/components/mis/qc/qc-screen';

export default async function QcPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'qc.write');
  const orders = (await listOrders()).filter((o: any) => !['CANCELLED','DELIVERED'].includes(o.status));
  return <QcScreen orders={orders} canWrite={canWrite} />;
}
