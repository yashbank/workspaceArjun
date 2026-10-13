import { formatFactoryDateTime } from '@/lib/mis/factory-time';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { IssueScreen } from '@/components/mis/store/issue-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { listIssueTargets, listPickerItems } from '@/server/mis/store';
import { listOpenOrderAllocations } from '@/server/mis/order-allocation';

/**
 * Goods out — the same cart, the other direction.
 *
 * Balances come from the inventory ledger so the cart can refuse an over-issue
 * as it is typed; the server checks them again on commit.
 */
export default async function StoreIssuePage() {
  const user = await requireMisAccess();
  const [items, targets, allocations] = await Promise.all([
    listPickerItems(),
    listIssueTargets(),
    listOpenOrderAllocations(),
  ]);

  const meta = `${formatFactoryDateTime(new Date(), await getFactoryTimezone())} · ${user.name ?? user.email}`;

  return (
    <IssueScreen
      header={{ title: 'Issue', meta }}
      items={items}
      orders={targets.orders}
      departments={targets.departments}
      allocations={allocations}
    />
  );
}
