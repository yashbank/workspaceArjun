import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listItems } from '@/server/mis/item';
import { ItemScreen } from '@/components/mis/items/item-screen';

export default async function ItemsPage() {
  await requireMisAccess();
  const [items, canWrite] = await Promise.all([listItems(), checkPermission('masters.write')]);
  return <ItemScreen items={items} canWrite={canWrite} />;
}
