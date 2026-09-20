import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { listStockSummary } from '@/server/mis/store';
import { StoreStockScreen } from '@/components/mis/store/store-stock-screen';

export default async function StoreStockPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const isOwner = role === 'OWNER';
  const rows = await listStockSummary();
  return <StoreStockScreen rows={rows} isOwner={isOwner} />;
}
