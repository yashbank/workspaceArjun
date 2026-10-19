import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { checkPermission } from '@/server/mis/auth';
import { listIssueTargets, listStoreItems } from '@/server/mis/store';
import { StoreItemScreen } from '@/components/mis/store/store-item-screen';

export default async function StorePage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = await checkPermission('store.write');
  const isOwner = role === 'OWNER';

  const [items, targets] = await Promise.all([listStoreItems(), listIssueTargets()]);

  return <StoreItemScreen items={items} canWrite={canWrite} isOwner={isOwner} targets={targets} />;
}
