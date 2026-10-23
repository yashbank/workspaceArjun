import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listSuppliersPage } from '@/server/mis/supplier';
import { SupplierScreen } from '@/components/mis/suppliers/supplier-screen';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireMisAccess();
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  const [paged, canWrite] = await Promise.all([listSuppliersPage({ q, page: sp.page }), checkPermission('po.write')]);
  return (
    <SupplierScreen
      suppliers={paged.rows}
      canWrite={canWrite}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), params: { q } }}
    />
  );
}
