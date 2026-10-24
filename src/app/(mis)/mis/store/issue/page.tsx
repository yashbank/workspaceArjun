import { formatFactoryDateTime } from '@/lib/mis/factory-time';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { IssueScreen } from '@/components/mis/store/issue-screen';
import { RaiseRequestInstead } from '@/components/mis/store/raise-request-instead';
import { checkPermission } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { listCostCenters, listIssueTargets, listPickerItems } from '@/server/mis/store';
import { listOpenOrderAllocations, listOpenOrderBomMaterials } from '@/server/mis/order-allocation';

/**
 * Goods out — the same cart, the other direction.
 *
 * Balances come from the inventory ledger so the cart can refuse an over-issue
 * as it is typed; the server checks them again on commit.
 */
export default async function StoreIssuePage() {
  const user = await requireMisAccess();
  const meta = `${formatFactoryDateTime(new Date(), await getFactoryTimezone())} · ${user.name ?? user.email}`;
  // R2-38: a Supervisor (store.read, no store.write) is told to raise a request, not shown a form that would 403.
  if (!(await checkPermission('store.write'))) return <RaiseRequestInstead header={{ title: 'Issue', meta }} />;
  const [items, targets, allocations, bomMaterials, costCenters] = await Promise.all([
    listPickerItems(),
    listIssueTargets(),
    listOpenOrderAllocations(),
    listOpenOrderBomMaterials(),
    listCostCenters(),
  ]);

  return (
    <IssueScreen
      header={{ title: 'Issue', meta }}
      items={items}
      orders={targets.orders}
      departments={targets.departments}
      costCenters={costCenters}
      allocations={allocations}
      bomMaterials={bomMaterials}
    />
  );
}
