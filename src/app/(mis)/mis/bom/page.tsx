import { requireMisAccess } from '@/server/mis/guard';
import { listBomOverviewPage } from '@/server/mis/bom';
import { BomListScreen } from '@/components/mis/bom/bom-list-screen';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function BomListPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireMisAccess();
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  const paged = await listBomOverviewPage({ q, page: sp.page });
  return (
    <BomListScreen
      rows={paged.rows}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), params: { q } }}
    />
  );
}
