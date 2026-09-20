import { format } from 'date-fns';

import { IssueScreen } from '@/components/mis/store/issue-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { listIssueTargets, listPickerItems } from '@/server/mis/store';

/**
 * Goods out — the same cart, the other direction.
 *
 * Balances come from the inventory ledger so the cart can refuse an over-issue
 * as it is typed; the server checks them again on commit.
 */
export default async function StoreIssuePage() {
  const user = await requireMisAccess();
  const [items, targets] = await Promise.all([
    listPickerItems(),
    listIssueTargets(),
  ]);

  const meta = `${format(new Date(), 'EEE d MMM · HH:mm')} · ${user.name ?? user.email}`;

  return (
    <IssueScreen
      header={{ title: 'Issue', meta }}
      items={items}
      orders={targets.orders}
      departments={targets.departments}
    />
  );
}
