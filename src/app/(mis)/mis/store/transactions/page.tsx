import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listAllStoreTxns, listStoreItems } from '@/server/mis/store';
import { StoreTransactionsScreen } from '@/components/mis/store/store-transactions-screen';

export default async function StoreTransactionsPage() {
  await requireMisAccess();

  const [txns, items, canWrite] = await Promise.all([
    listAllStoreTxns(),
    listStoreItems(),
    checkPermission('store.write'),
  ]);

  return <StoreTransactionsScreen txns={txns} items={items} canWrite={canWrite} />;
}
