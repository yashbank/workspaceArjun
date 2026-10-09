import { isUuid } from '@/lib/mis/ids';
import { toPlain } from '@/lib/mis/plain';
import { notFound } from 'next/navigation';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { getGRN } from '@/server/mis/grn';
import { formatMoney } from '@/server/mis/po';
import { clearGrnAlertsFor } from '@/server/mis/grn-alerts';
import { GrnDetailScreen } from '@/components/mis/grn/grn-detail-screen';

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const grn = await getGRN(id);
  if (!grn) notFound();
  const [canWrite, canSeeMoney] = await Promise.all([checkPermission('grn.write'), checkPermission('wages.read'), clearGrnAlertsFor(id).catch(() => undefined)]);
  // Money is formatted here, on the server (MIS invariant); the raw figure travels only to the Owner's edit form.
  const invoiceAmountFormatted = canSeeMoney && grn.supplierInvoiceAmount != null ? formatMoney(grn.supplierInvoiceAmount) : null;
  return <GrnDetailScreen grn={toPlain(grn)} canWrite={canWrite} canSeeMoney={canSeeMoney} invoiceAmountFormatted={invoiceAmountFormatted} />;
}
