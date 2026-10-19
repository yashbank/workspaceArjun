import { requireMisAccess } from '@/server/mis/guard';
import { getInventoryPage } from '@/server/mis/inventory';
import { checkPermission } from '@/server/mis/auth';
import { InventoryScreen } from '@/components/mis/inventory/inventory-screen';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireMisAccess();
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  const [paged, canWrite, canPrice] = await Promise.all([
    getInventoryPage({ q, page: sp.page }),
    checkPermission('masters.write'),
    checkPermission('wages.read'),
  ]);
  return (
    <InventoryScreen
      summary={paged.rows}
      canWrite={canWrite}
      canPrice={canPrice}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), params: { q }, outOfStock: paged.outOfStock }}
    />
  );
}
