import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { listStockSummary } from '@/server/mis/store';
import { formatMoney } from '@/server/mis/po';
import { StoreStockScreen } from '@/components/mis/store/store-stock-screen';

export default async function StoreStockPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const isOwner = role === 'OWNER';
  const rows = await listStockSummary();
  // The Owner's total is summed and formatted here from the server-rounded row values; the screen only prints it.
  const totalValueLabel = isOwner ? formatMoney(Math.round(rows.reduce((sum, r) => sum + (r.stockValue ?? 0), 0) * 100) / 100) : null;
  return <StoreStockScreen rows={rows} isOwner={isOwner} totalValueLabel={totalValueLabel} />;
}
