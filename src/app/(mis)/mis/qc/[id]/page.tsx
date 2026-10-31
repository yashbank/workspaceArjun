import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { getQcForOrder, getQcSummary } from '@/server/mis/qc';
import { listDefectTypes } from '@/server/mis/defect-type';
import { listQcTemplates } from '@/server/mis/qc-template';
import { db } from '@/server/db';
import { factoryDateKey } from '@/lib/mis/factory-time';
import { resolveShiftAt } from '@/lib/mis/shift-window';
import { shiftDateKeyFor } from '@/lib/mis/crew-hours';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { stageOptions } from '@/lib/mis/production-form';
import { isOrderClosed } from '@/lib/mis/order-status';
import { correctionVerdict } from '@/lib/mis/entry-correction';
import { notFound } from 'next/navigation';
import { QcDetailScreen } from '@/components/mis/qc/qc-detail-screen';


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

  const [checks, summary, defectTypes, allTemplates, timeZone, stages, shifts, machines] = await Promise.all([
    getQcForOrder(id),
    getQcSummary(id),
    listDefectTypes(),
    listQcTemplates(true),
    getFactoryTimezone(),
    // #33 — stages of this order's BOM, for the Add Check form (qc.read already passed above).
    db.misBomStage.findMany({
      where: { bom: { orderId: id } },
      select: { id: true, stageName: true, seq: true },
      orderBy: { seq: 'asc' },
    }),
    db.misShift.findMany({ where: { isActive: true }, select: { id: true, startTime: true, endTime: true }, orderBy: { startTime: 'asc' } }),
    // R2-318: the machine a check was taken at.
    db.misMachine.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  // R2-323: an archived (inactive) template stays readable for the checks already recorded on it for this order.
  const usedTemplateIds = new Set(checks.map((c) => c.templateId).filter(Boolean));
  const templates = allTemplates.filter((t) => t.isActive || usedTemplateIds.has(t.id));
  // R2-312: the checklist sheet is one SHIFT day, so a night shift's post-midnight taps stay on the sheet it started on.
  const now = new Date();
  const currentShift = resolveShiftAt(shifts, now, timeZone) ?? null;
  const sheetDateKey = currentShift ? shiftDateKeyFor(currentShift, now, timeZone) : factoryDateKey(now, timeZone);

  // R2-34: the same rule `editQcCheck` / `voidQcCheck` enforce (the real gate); this only decides which buttons to draw.
  const mayCorrect = (c: (typeof checks)[number], action: 'EDIT' | 'DELETE') =>
    canWrite &&
    !isOrderClosed(order.status) &&
    !c.acknowledgedAt &&
    correctionVerdict({ kind: 'QC', action, role, actorId: user.id, ownerId: c.checkById, at: new Date(c.createdAt), now, timeZone }).allowed;

  return (
    <QcDetailScreen
      order={{ id: order.id, orderNumber: order.orderNumber, status: order.status, customer: order.customer }}
      // `getQcForOrder` returns the relation as `bomStage`; the table reads `stage` (it never showed one).
      // `editable` / `deletable` (B84, R2-34) are decided here on the server clock.
      checks={checks.map((c) => ({
        ...c,
        stage: c.bomStage,
        defectQty: c.defectQty != null ? Number(c.defectQty) : null,
        editable: mayCorrect(c, 'EDIT'),
        deletable: mayCorrect(c, 'DELETE'),
      }))}
      stages={stageOptions(stages)}
      machines={machines.map((m) => ({ value: m.id, label: m.name }))}
      summary={summary}
      canWrite={canWrite}
      canAcknowledge={can(role, 'qc.acknowledge')}
      defectTypes={defectTypes.map((dt) => ({ id: dt.id, code: dt.code, name: dt.name, severity: dt.severity }))}
      templates={templates}
      checklistDay={{ dateKey: sheetDateKey, timeZone, shift: currentShift ? { startTime: currentShift.startTime, endTime: currentShift.endTime } : null }}
    />
  );
}
