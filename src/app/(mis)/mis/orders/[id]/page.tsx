import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { getOrder } from '@/server/mis/orders';
import { getBom } from '@/server/mis/bom';
import { getProductionForOrder, getProductionSummary } from '@/server/mis/production';
import { getPhasesForOrder } from '@/server/mis/job-phases';
import { getQcForOrder, getQcSummary } from '@/server/mis/qc';
import { listDocuments } from '@/server/mis/documents';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { OrderDetailDesktop } from '@/components/mis/desktop/order-detail-desktop';
import { OrderDetailScreen } from '@/components/mis/orders/order-detail-screen';
import { getOrderDesktopView } from '@/server/mis/order-desktop';
import { getOrderAllocations } from '@/server/mis/order-allocation';
import { notFound } from 'next/navigation';

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { view } = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);

  const order = await getOrder(id);
  if (!order) notFound();

  const [bom, productionLogs, productionSummary, qcLogs, qcSummary, phases, documents, allocations] = await Promise.all([
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
    listDocuments(id).catch(() => []),
    getOrderAllocations(id).catch(() => []),
  ]);

  const canWrite = can(role, 'orders.write');
  const canSeeWages = can(role, 'wages.read');
  const canProduction = can(role, 'production.read');
  const canQc = can(role, 'qc.read');

  // D4 from 1024px up; the existing screen below it. `?view=classic` keeps the full screen (production
  // and QC logs, reopen) reachable on a desktop, because D4 deliberately carries neither.
  const desktop = view === 'classic' ? null : await getOrderDesktopView(id);

  const phone = (
    <OrderDetailScreen
      order={order}
      phases={phases.map((p) => ({
        id: p.id,
        sequence: p.sequence,
        status: p.status,
        processName: p.process.name,
        inChargeName: p.inCharge?.name ?? null,
        downstreamFlagged: p.downstreamFlagged,
      }))}
      bom={bom}
      productionLogs={productionLogs.map((l) => ({
        ...l,
        qtyProduced: Number(l.qtyProduced),
        qtyWaste: Number(l.qtyWaste),
      }))}
      productionSummary={productionSummary}
      qcLogs={qcLogs}
      qcSummary={qcSummary}
      documents={documents}
      allocations={allocations}
      canWrite={canWrite}
      canSeeWages={canSeeWages}
      canProduction={canProduction}
      canQc={canQc}
    />
  );

  if (!desktop) return phone;

  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <OrderDetailDesktop data={desktop} />
      </div>
    </>
  );
}
