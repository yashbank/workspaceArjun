import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listCustomers } from '@/server/mis/customer';
import { CustomerScreen } from '@/components/mis/customers/customer-screen';

export default async function CustomersPage() {
  await requireMisAccess();
  const [customers, canWrite] = await Promise.all([listCustomers(), checkPermission('orders.write')]);
  return <CustomerScreen customers={customers} canWrite={canWrite} />;
}
