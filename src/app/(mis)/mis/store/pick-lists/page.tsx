import { PickListListScreen } from '@/components/mis/store/pick-list-screens';
import { toPlain } from '@/lib/mis/plain';
import { requireMisAccess } from '@/server/mis/guard';
import { listPickLists } from '@/server/mis/pick-list';

export default async function PickListsPage() {
  await requireMisAccess();
  return <PickListListScreen lists={toPlain(await listPickLists())} />;
}
