import { MasterDataDesktopServer } from '@/components/mis/desktop/master-data-desktop-server';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listCustomers } from '@/server/mis/customer';
import { CustomerScreen } from '@/components/mis/customers/customer-screen';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; deactivated?: string; edit?: string; create?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireMisAccess();
  const [customers, canWrite] = await Promise.all([listCustomers(), checkPermission('orders.write')]);
  const phone = <CustomerScreen customers={customers} canWrite={canWrite} />;

  // D10 from 1024px up; the existing screen below it. ANY explicit `?view` is the existing screen at every width.
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <MasterDataDesktopServer master="customers" searchParams={sp} />
      </div>
    </>
  );
}
