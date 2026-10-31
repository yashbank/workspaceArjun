import { isUuid } from '@/lib/mis/ids';
import { toPlain } from '@/lib/mis/plain';
import { notFound } from 'next/navigation';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { getGRN, listQuarantineForGrn } from '@/server/mis/grn';
import { listIssueTargets } from '@/server/mis/store';
import { formatMoney } from '@/server/mis/po';
import { clearGrnAlertsFor } from '@/server/mis/grn-alerts';
import { GrnDetailScreen } from '@/components/mis/grn/grn-detail-screen';

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const grn = await getGRN(id);
  if (!grn) notFound();
  // `supplier_invoice.write` is held by exactly Owner and Admin: the roles that may override the 2% receipt limit.
  const [canWrite, canSeeMoney, canOverride] = await Promise.all([checkPermission('grn.write'), checkPermission('wages.read'), checkPermission('supplier_invoice.write'), clearGrnAlertsFor(id).catch(() => undefined)]);
  const orders = grn.status === 'DRAFT' ? await listIssueTargets().then((t) => t.orders).catch(() => []) : [];
  // R2-278: damaged lots held for this GRN (quantities only). R2-277: `wages.read` is the Owner's gate (D24), so canReverse = Owner.
  const quarantine = grn.status === 'DRAFT' ? [] : await listQuarantineForGrn(id);
  // Money is formatted here, on the server (MIS invariant); the raw figure travels only to the Owner's edit form.
  const invoiceAmountFormatted = canSeeMoney && grn.supplierInvoiceAmount != null ? formatMoney(grn.supplierInvoiceAmount) : null;
  return <GrnDetailScreen grn={toPlain(grn)} canWrite={canWrite} orders={orders} canOverride={canWrite && canOverride} canSeeMoney={canSeeMoney} invoiceAmountFormatted={invoiceAmountFormatted} canReverse={canWrite && canSeeMoney} quarantine={toPlain(quarantine)} />;
}
