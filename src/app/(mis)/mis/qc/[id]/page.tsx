import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { getQcForOrder, getQcSummary } from '@/server/mis/qc';
import { listDefectTypes } from '@/server/mis/defect-type';
import { listQcTemplates } from '@/server/mis/qc-template';
import { db } from '@/server/db';
import { factoryDateKey } from '@/lib/mis/factory-time';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { stageOptions } from '@/lib/mis/production-form';
import { isOrderClosed } from '@/lib/mis/order-status';
import { notFound } from 'next/navigation';
import { QcDetailScreen } from '@/components/mis/qc/qc-detail-screen';

/** Mirrors `editQcCheck`'s 24 h window (server/mis/qc.ts), which is the real gate; this only decides whether to show "Edit". */
const QC_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const withinEditWindow = (createdAt: Date | string) => Date.now() - new Date(createdAt).valueOf() <= QC_EDIT_WINDOW_MS;

export default async function QcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'qc.write');

  const order = await db.misOrder.findUnique({
    where: { id },
    include: { customer: { select: { name: true } } },
  });
  if (!order) notFound();

  const [checks, summary, defectTypes, templates, timeZone, stages] = await Promise.all([
    getQcForOrder(id),
    getQcSummary(id),
    listDefectTypes(),
    listQcTemplates(),
    getFactoryTimezone(),
    // #33 — stages of this order's BOM, for the Add Check form (qc.read already passed above).
    db.misBomStage.findMany({
      where: { bom: { orderId: id } },
      select: { id: true, stageName: true, seq: true },
      orderBy: { seq: 'asc' },
    }),
  ]);

  return (
    <QcDetailScreen
      order={{ id: order.id, orderNumber: order.orderNumber, status: order.status, customer: order.customer }}
      // `getQcForOrder` returns the relation as `bomStage`; the table reads `stage` (it never showed one).
      // `editable` (B84) is decided here on the server clock: within 24 h, not acknowledged, order open.
      checks={checks.map((c) => ({
        ...c,
        stage: c.bomStage,
        defectQty: c.defectQty != null ? Number(c.defectQty) : null,
        editable: canWrite && !isOrderClosed(order.status) && !c.acknowledgedAt && withinEditWindow(c.createdAt),
      }))}
      stages={stageOptions(stages)}
      summary={summary}
      canWrite={canWrite}
      defectTypes={defectTypes.map((dt) => ({ id: dt.id, code: dt.code, name: dt.name, severity: dt.severity }))}
      templates={templates}
      checklistDay={{ dateKey: factoryDateKey(new Date(), timeZone), timeZone }}
    />
  );
}
