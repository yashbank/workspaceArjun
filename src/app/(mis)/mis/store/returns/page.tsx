import { ReturnsScreen } from '@/components/mis/store/returns-screen';
import { toPlain } from '@/lib/mis/plain';
import { checkPermission } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { listIssueTargets, listPickerItems } from '@/server/mis/store';
import { listStoreReturns } from '@/server/mis/store-return';

export default async function StoreReturnsPage() {
  await requireMisAccess();
  const [returns, items, targets, canDecide] = await Promise.all([listStoreReturns(), listPickerItems(), listIssueTargets(), checkPermission('store.write')]);
  return (
    <ReturnsScreen
      returns={toPlain(returns)}
      items={items.map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit }))}
      orders={targets.orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber }))}
      canDecide={canDecide}
    />
  );
}
