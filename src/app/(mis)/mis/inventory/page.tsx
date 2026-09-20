import { requireMisAccess } from '@/server/mis/guard';
import { getInventorySummary } from '@/server/mis/inventory';
import { checkPermission } from '@/server/mis/auth';
import { InventoryScreen } from '@/components/mis/inventory/inventory-screen';

export default async function InventoryPage() {
  await requireMisAccess();
  const [summary, canWrite] = await Promise.all([
    getInventorySummary(),
    checkPermission('masters.write'),
  ]);
  return <InventoryScreen summary={summary} canWrite={canWrite} />;
}
