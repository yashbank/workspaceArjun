import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { getProductionForOrder, getProductionSummary } from '@/server/mis/production';
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

  const [logs, summary, employees, machines] = await Promise.all([
    getProductionForOrder(id),
    getProductionSummary(id),
    listEmployees(),
    listMachines(),
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
      employees={employees.filter((e) => e.isActive).map((e) => ({ id: e.id, name: e.name }))}
      machines={machines.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name }))}
      canWrite={canWrite}
      userId={user.id}
    />
  );
}
