import { format } from 'date-fns';

import { RequestScreen } from '@/components/mis/store/request-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { listIssueTargets, listPickerItems } from '@/server/mis/store';

/** A Supervisor's material ask — the issue cart, but nothing moves until the Store approves. */
export default async function NewMaterialRequestPage() {
  const user = await requireMisAccess();
  const [items, targets] = await Promise.all([listPickerItems(), listIssueTargets()]);
  const meta = `${format(new Date(), 'EEE d MMM · HH:mm')} · ${user.name ?? user.email}`;
  return <RequestScreen header={{ title: 'Request material', meta }} items={items} orders={targets.orders} departments={targets.departments} />;
}
