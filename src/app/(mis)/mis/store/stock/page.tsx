import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { listStockSummary, listStockSummaryPage } from '@/server/mis/store';
import { formatMoney } from '@/server/mis/po';
import { StoreStockScreen } from '@/components/mis/store/store-stock-screen';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function StoreStockPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const isOwner = role === 'OWNER';
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  // R2-134: the list itself pages 10 at a time; the Owner's total value still covers the whole book, not just the page shown.
  const [paged, allRows] = await Promise.all([listStockSummaryPage({ q, page: sp.page }), isOwner ? listStockSummary() : Promise.resolve([])]);
  const totalValueLabel = isOwner ? formatMoney(Math.round(allRows.reduce((sum, r) => sum + (r.stockValue ?? 0), 0) * 100) / 100) : null;
  return (
    <StoreStockScreen
      rows={paged.rows}
      isOwner={isOwner}
      totalValueLabel={totalValueLabel}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), params: { q } }}
    />
  );
}
