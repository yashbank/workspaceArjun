import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listPOsPage, listApprovedBomOrders } from '@/server/mis/po';
import { listSuppliers } from '@/server/mis/supplier';
import { PoListScreen } from '@/components/mis/po/po-list-screen';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function PoPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireMisAccess();
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  // R2-37: QC holds po.view only — the supplier / BOM pickers feed the "New PO" form, which is write-only.
  const [paged, canWrite, canReadSuppliers] = await Promise.all([listPOsPage({ q, page: sp.page }), checkPermission('po.write'), checkPermission('po.read')]);
  const [suppliers, approvedBoms] = canWrite && canReadSuppliers ? await Promise.all([listSuppliers(), listApprovedBomOrders()]) : [[], []];
  return (
    <PoListScreen
      pos={paged.rows}
      suppliers={suppliers}
      canWrite={canWrite}
      approvedBoms={approvedBoms}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), params: { q } }}
    />
  );
}
