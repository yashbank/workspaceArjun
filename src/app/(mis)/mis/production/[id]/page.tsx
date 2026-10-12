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

  return (
    <ProductionDetailScreen
      order={{ id: order.id, orderNumber: order.orderNumber, status: order.status, customer: order.customer }}
      logs={logs.map((l) => ({
        id: l.id,
        loggedAt: l.loggedAt,
        qtyProduced: Number(l.qtyProduced),
        qtyWaste: Number(l.qtyWaste),
        unit: l.unit,
        notes: l.notes,
        machine: l.machine,
        employee: l.employee,
        shift: l.shift,
      }))}
      summary={summary}
      operators={operatorOptions(employees)}
      machines={machines.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name }))}
      units={unitOptions(unitMaster, logs[0]?.unit)}
      stages={stageOptions(formContext.stages)}
      allocatedMachines={formContext.machines}
      canWrite={canWrite}
      userId={user.id}
    />
  );
}
