import { requireMisAccess } from '@/server/mis/guard';
import { listOrders, listQcOrdersPage } from '@/server/mis/orders';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { listDefectTypes } from '@/server/mis/defect-type';
import { QcScreen } from '@/components/mis/qc/qc-screen';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function QcPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'qc.write');
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  // R2-130: the visible table pages 10 at a time; the "Add Check" picker still offers every active order, not just the page shown.
  const [paged, pickerOrders, defectTypes] = await Promise.all([
    listQcOrdersPage({ q, page: sp.page }),
    listOrders().then((rows) => rows.filter((o: { status: string }) => !['CANCELLED', 'DELIVERED'].includes(o.status))),
    listDefectTypes(),
  ]);
  return (
    <QcScreen
      orders={paged.rows}
      pickerOrders={pickerOrders}
      canWrite={canWrite}
      defectTypes={defectTypes.map((dt) => ({ id: dt.id, code: dt.code, name: dt.name, severity: dt.severity }))}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), params: { q } }}
    />
  );
}
