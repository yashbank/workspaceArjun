import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listPOs, listApprovedBomOrders } from '@/server/mis/po';
import { listSuppliers } from '@/server/mis/supplier';
import { PoListScreen } from '@/components/mis/po/po-list-screen';

export default async function PoPage() {
  await requireMisAccess();
  const [pos, suppliers, canWrite, approvedBoms] = await Promise.all([
    listPOs(),
    listSuppliers(),
    checkPermission('po.write'),
    listApprovedBomOrders(),
  ]);
  return <PoListScreen pos={pos} suppliers={suppliers} canWrite={canWrite} approvedBoms={approvedBoms} />;
}
