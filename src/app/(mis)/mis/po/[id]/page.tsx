import { notFound } from 'next/navigation';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { getPO, computePoTotal, formatMoney } from '@/server/mis/po';
import { listItems } from '@/server/mis/item';
import { PoDetailScreen } from '@/components/mis/po/po-detail-screen';

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMisAccess();
  const po = await getPO(id);
  if (!po) notFound();
  const [total, items, canWrite, canApprove] = await Promise.all([
    computePoTotal(id),
    listItems(),
    checkPermission('po.write'),
    checkPermission('po.write'),
  ]);
  type PoItem = (typeof po.items)[number];
  const formattedItems = po.items.map((item: PoItem) => ({
    ...item,
    rateFormatted: formatMoney(item.ratePerUnit),
    totalFormatted: formatMoney(item.quantity.toNumber() * item.ratePerUnit.toNumber()),
    quantity: item.quantity.toNumber(),
    ratePerUnit: item.ratePerUnit.toNumber(),
    receivedQuantity: item.receivedQuantity.toNumber(),
  }));
  return <PoDetailScreen po={po} formattedItems={formattedItems} total={total} catalogItems={items} canWrite={canWrite} canApprove={canApprove} />;
}
