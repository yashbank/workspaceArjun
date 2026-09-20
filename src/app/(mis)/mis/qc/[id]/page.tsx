import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { getQcForOrder, getQcSummary } from '@/server/mis/qc';
import { listDefectTypes } from '@/server/mis/defect-type';
import { db } from '@/server/db';
import { notFound } from 'next/navigation';
import { QcDetailScreen } from '@/components/mis/qc/qc-detail-screen';

export default async function QcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'qc.write');

  const order = await db.misOrder.findUnique({
    where: { id },
    include: { customer: { select: { name: true } } },
  });
  if (!order) notFound();

  const [checks, summary, defectTypes] = await Promise.all([
    getQcForOrder(id),
    getQcSummary(id),
    listDefectTypes(),
  ]);

  return (
    <QcDetailScreen
      order={{ id: order.id, orderNumber: order.orderNumber, status: order.status, customer: order.customer }}
      checks={checks.map((c) => ({ ...c, defectQty: c.defectQty != null ? Number(c.defectQty) : null }))}
      summary={summary}
      canWrite={canWrite}
      defectTypes={defectTypes.map((dt) => ({ id: dt.id, code: dt.code, name: dt.name, severity: dt.severity }))}
    />
  );
}
