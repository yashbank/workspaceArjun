import { formatFactoryDateTime } from '@/lib/mis/factory-time';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { RequestScreen } from '@/components/mis/store/request-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { listCostCenters, listIssueTargets, listPickerItems } from '@/server/mis/store';

/** A Supervisor's material ask — the issue cart, but nothing moves until the Store approves. */
export default async function NewMaterialRequestPage() {
  const user = await requireMisAccess();
  const [items, targets, costCenters] = await Promise.all([listPickerItems(), listIssueTargets(), listCostCenters()]);
  const meta = `${formatFactoryDateTime(new Date(), await getFactoryTimezone())} · ${user.name ?? user.email}`;
  return <RequestScreen header={{ title: 'Request material', meta }} items={items} orders={targets.orders} departments={targets.departments} costCenters={costCenters} />;
}
