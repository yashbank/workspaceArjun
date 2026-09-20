import { requireMisAccess } from '@/server/mis/guard';
import { getOrder } from '@/server/mis/orders';
import { getBom } from '@/server/mis/bom';
import { getProductionForOrder, getProductionSummary } from '@/server/mis/production';
import { getPhasesForOrder } from '@/server/mis/job-phases';
import { getQcForOrder, getQcSummary } from '@/server/mis/qc';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { OrderDetailScreen } from '@/components/mis/orders/order-detail-screen';
import { notFound } from 'next/navigation';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);

  const order = await getOrder(id);
  if (!order) notFound();

  const [bom, productionLogs, productionSummary, qcLogs, qcSummary, phases] = await Promise.all([
    getBom(id).catch(() => null),
    getProductionForOrder(id).catch(() => []),
    getProductionSummary(id).catch(() => ({ totalProduced: 0, totalWaste: 0, entries: 0 })),
    getQcForOrder(id).catch(() => []),
    getQcSummary(id).catch(() => ({ total: 0, pass: 0, fail: 0 })),
    // Deliberately NOT caught to an empty list like its neighbours: an empty
    // list renders "No phase plan · not gated" (D10), so swallowing a failure
    // here would make the screen claim a gate is absent when it may not be.
    // Every role that can reach this page holds phase.read; if that ever stops
    // being true, this should break loudly rather than lie.
    getPhasesForOrder(id),
  ]);

  const canWrite = can(role, 'orders.write');
  const canSeeWages = can(role, 'wages.read');
  const canProduction = can(role, 'production.read');
  const canQc = can(role, 'qc.read');

  return (
    <OrderDetailScreen
      order={order as any}
      phases={phases.map((p) => ({
        id: p.id,
        sequence: p.sequence,
        status: p.status,
        processName: p.process.name,
        inChargeName: p.inCharge?.name ?? null,
        downstreamFlagged: p.downstreamFlagged,
      }))}
      bom={bom as any}
      productionLogs={productionLogs as any[]}
      productionSummary={productionSummary as any}
      qcLogs={qcLogs as any[]}
      qcSummary={qcSummary as any}
      canWrite={canWrite}
      canSeeWages={canSeeWages}
      canProduction={canProduction}
      canQc={canQc}
    />
  );
}
