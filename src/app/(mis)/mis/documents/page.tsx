import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { DocumentsScreen } from '@/components/mis/documents/documents-screen';

export default async function DocumentsPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'orders.write');
  const orders = await listOrders();
  return <DocumentsScreen orders={orders as any[]} canWrite={canWrite} />;
}
