import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { getMisRole } from '@/server/mis/roles';
import { canOverrideCloseGates, type CloseGate } from '@/lib/mis/order-transitions';
import { getOrderCloseGates, listOrdersPage } from '@/server/mis/orders';
import { listCustomers } from '@/server/mis/customer';
import { OrdersScreen } from '@/components/mis/orders/orders-screen';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ customerId?: string; q?: string; page?: string }> }) {
  const user = await requireMisAccess();
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  const [paged, customers, canWrite] = await Promise.all([
    listOrdersPage({ q, page: sp.page }),
    listCustomers(),
    checkPermission('orders.write'),
  ]);
  const orders = paged.rows;
  // R2-31/32: status controls on the list. Close gates are only needed for orders that can still be completed.
  const role = await getMisRole(user.id);
  const gatesByOrder: Record<string, CloseGate[]> = {};
  if (canWrite) {
    await Promise.all(orders.filter((o) => o.status === 'IN_PRODUCTION').map(async (o) => {
      gatesByOrder[o.id] = await getOrderCloseGates(o.id).catch(() => []);
    }));
  }
  return (
    <OrdersScreen
      orders={orders}
      customers={customers}
      canWrite={canWrite}
      initialCustomerId={sp.customerId}
      gatesByOrder={gatesByOrder}
      canOverride={canOverrideCloseGates(role ?? '')}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), params: { q, customerId: sp.customerId } }}
    />
  );
}
