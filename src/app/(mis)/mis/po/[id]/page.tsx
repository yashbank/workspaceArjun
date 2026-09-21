import { isUuid } from '@/lib/mis/ids';
import { toPlain } from '@/lib/mis/plain';
import { notFound } from 'next/navigation';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { getPO, computePoTotal, formatMoney } from '@/server/mis/po';
import { listItems } from '@/server/mis/item';
import { PoDetailScreen } from '@/components/mis/po/po-detail-screen';

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const po = await getPO(id);
  if (!po) notFound();
  // Rates and totals are money (D24, F-06): only `wages.read` receives them. For anyone else `getPO`
  // has already removed the rate, and the total is neither computed nor sent.
  const [canSeeMoney, items, canWrite, canApprove] = await Promise.all([
    checkPermission('wages.read'),
    listItems(),
    checkPermission('po.write'),
    checkPermission('po.write'),
  ]);
  const total = canSeeMoney ? await computePoTotal(id) : null;
  type PoItem = (typeof po.items)[number];
  const formattedItems = po.items.map((item: PoItem) => ({
    id: item.id,
    description: item.description,
    item: item.item,
    quantity: item.quantity.toNumber(),
    receivedQuantity: item.receivedQuantity.toNumber(),
    ...(canSeeMoney && item.ratePerUnit
      ? {
          ratePerUnit: item.ratePerUnit.toNumber(),
          rateFormatted: formatMoney(item.ratePerUnit),
          totalFormatted: formatMoney(item.quantity.toNumber() * item.ratePerUnit.toNumber()),
        }
      : {}),
  }));
  return <PoDetailScreen po={toPlain(po)} formattedItems={formattedItems} total={total} catalogItems={toPlain(items)} canWrite={canWrite} canApprove={canApprove} />;
}
