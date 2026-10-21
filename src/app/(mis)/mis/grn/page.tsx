import { requireMisAccess } from '@/server/mis/guard';
import { toPlain } from '@/lib/mis/plain';
import { checkPermission } from '@/server/mis/auth';
import { listGRNsPage } from '@/server/mis/grn';
import { listPOs } from '@/server/mis/po';
import { GrnListScreen } from '@/components/mis/grn/grn-list-screen';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function GrnPage({ searchParams = Promise.resolve({}) }: { searchParams?: Promise<{ q?: string; page?: string }> } = {}) {
  await requireMisAccess();
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  // The purchase orders are only for the "New GRN" form. A role that may READ receipts but not write them (the
  // Supervisor: `grn.read`, no `po.read`) must still see the list — `listPOs()` is refused for them, and asking
  // for it unconditionally denied the whole page (F-24).
  const canWrite = await checkPermission('grn.write');
  const canPickPo = canWrite && (await checkPermission('po.read'));
  const [paged, pos] = await Promise.all([listGRNsPage({ q, page: sp.page }), canPickPo ? listPOs() : Promise.resolve([])]);
  type Po = (typeof pos)[number];
  const approvedPos = pos.filter((p: Po) => ['APPROVED', 'RECEIVING', 'PARTIAL'].includes(p.status));
  return (
    <GrnListScreen
      grns={toPlain(paged.rows)}
      approvedPos={approvedPos}
      canWrite={canWrite}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), params: { q } }}
    />
  );
}
