import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listSuppliers } from '@/server/mis/supplier';
import { SupplierScreen } from '@/components/mis/suppliers/supplier-screen';

export default async function SuppliersPage() {
  await requireMisAccess();
  const [suppliers, canWrite] = await Promise.all([listSuppliers(), checkPermission('po.write')]);
  return <SupplierScreen suppliers={suppliers} canWrite={canWrite} />;
}
