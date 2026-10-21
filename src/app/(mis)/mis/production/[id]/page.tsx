import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { getProductionForOrder, getProductionFormContext, getProductionSummary } from '@/server/mis/production';
import { listOptions } from '@/server/mis/master-option';
import { operatorOptions, stageOptions, unitOptions } from '@/lib/mis/production-form';
import { listEmployees } from '@/server/mis/employee';
import { listMachines } from '@/server/mis/machine';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { factoryDateKey } from '@/lib/mis/factory-time';
import { correctionVerdict } from '@/lib/mis/entry-correction';
import { isOrderClosed } from '@/lib/mis/order-status';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { ProductionDetailScreen } from '@/components/mis/production/production-detail-screen';

export default async function ProductionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'production.write');

  const order = await db.misOrder.findUnique({
    where: { id },
    include: { customer: { select: { id: true, name: true } } },
  });
  if (!order) notFound();

  const [logs, summary, employees, machines, unitMaster, formContext] = await Promise.all([
    getProductionForOrder(id),
    getProductionSummary(id),
    // The pickers feed the log-entry form, which only a writer sees; a QC reader (no employees.read) was refused here.
    canWrite ? listEmployees() : Promise.resolve([]),
    canWrite ? listMachines() : Promise.resolve([]),
    // Same gate as the pickers above: only a writer sees the form these feed.
    canWrite ? listOptions('UNIT') : Promise.resolve([]),
    canWrite ? getProductionFormContext(id) : Promise.resolve({ stages: [], machines: [] }),
  ]);

  // R3 B122: who is booked on each of this order's machines right now (open rows only).
  const crewRows = canWrite
    ? await db.misWorkerAllocation.findMany({
        where: { deletedAt: null, releasedAt: null, machineAllocation: { orderId: id, releasedAt: null } },
        select: { employeeId: true, machineAllocation: { select: { machineId: true } } },
      })
    : [];
  const crewByMachine: Record<string, string[]> = {};
  for (const r of crewRows) {
    (crewByMachine[r.machineAllocation.machineId] ??= []).push(r.employeeId);
  }
  const timeZone = await getFactoryTimezone();
  const now = new Date();
  // R2-17: the same rule the server enforces decides whether Edit / Delete are drawn per row.
  const mayCorrect = (l: (typeof logs)[number], action: 'EDIT' | 'DELETE') =>
    canWrite &&
    l.jobPhase?.status !== 'SIGNED_OFF' &&
    !isOrderClosed(order.status) &&
    correctionVerdict({ kind: 'PRODUCTION', action, role, actorId: user.id, ownerId: l.loggedById, at: l.loggedAt, now, timeZone }).allowed;

  return (
    <ProductionDetailScreen
      order={{ id: order.id, orderNumber: order.orderNumber, status: order.status, customer: order.customer }}
      logs={logs.map((l) => ({
        id: l.id,
        phaseSigned: l.jobPhase?.status === 'SIGNED_OFF',
        machineId: l.machineId,
        employeeId: l.employeeId,
        loggedAt: l.loggedAt,
        qtyProduced: Number(l.qtyProduced),
        qtyWaste: Number(l.qtyWaste),
        unit: l.unit,
        notes: l.notes,
        machine: l.machine,
        employee: l.employee,
        shift: l.shift,
        stageName: l.bomStage?.stageName ?? null,
        makereadyMinutes: l.makereadyMinutes ?? null,
        canEdit: mayCorrect(l, 'EDIT'),
        canDelete: mayCorrect(l, 'DELETE'),
      }))}
      summary={summary}
      operators={operatorOptions(employees)}
      machines={machines.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name }))}
      units={unitOptions(unitMaster, logs[0]?.unit)}
      stages={stageOptions(formContext.stages)}
      allocatedMachines={formContext.machines}
      canWrite={canWrite}
      userId={user.id}
      crewByMachine={crewByMachine}
      factoryToday={factoryDateKey(new Date(), timeZone)}
      nowIso={new Date().toISOString()}
    />
  );
}
