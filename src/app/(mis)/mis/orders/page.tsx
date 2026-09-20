import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listOrders } from '@/server/mis/orders';
import { listCustomers } from '@/server/mis/customer';
import { OrdersScreen } from '@/components/mis/orders/orders-screen';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requireMisAccess();
  const sp = await searchParams;
  const [orders, customers, canWrite] = await Promise.all([
    listOrders(),
    listCustomers(),
    checkPermission('orders.write'),
  ]);
  return <OrdersScreen orders={orders} customers={customers} canWrite={canWrite} initialCustomerId={sp.customerId} />;
}
