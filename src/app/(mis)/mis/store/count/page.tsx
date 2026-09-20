import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listStockSummary, listPhysicalCounts } from '@/server/mis/store';
import { StoreCountScreen } from '@/components/mis/store/store-count-screen';

export default async function StoreCountPage() {
  await requireMisAccess();
  const canCount = await checkPermission('store.count');

  const [summary, counts] = await Promise.all([
    listStockSummary(),
    listPhysicalCounts(),
  ]);

  const items = summary.map((s) => ({
    id: s.id,
    code: s.code,
    sku: s.sku,
    name: s.name,
    unit: s.unit,
    stockBalance: s.stockBalance,
  }));

  return <StoreCountScreen items={items} counts={counts} canCount={canCount} />;
}
