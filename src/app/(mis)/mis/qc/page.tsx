import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { listDefectTypes } from '@/server/mis/defect-type';
import { QcScreen } from '@/components/mis/qc/qc-screen';

export default async function QcPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'qc.write');
  const [orders, defectTypes] = await Promise.all([
    listOrders().then((rows) => rows.filter((o: { status: string }) => !['CANCELLED', 'DELIVERED'].includes(o.status))),
    listDefectTypes(),
  ]);
  return (
    <QcScreen
      orders={orders}
      canWrite={canWrite}
      defectTypes={defectTypes.map((dt) => ({ id: dt.id, code: dt.code, name: dt.name, severity: dt.severity }))}
    />
  );
}
