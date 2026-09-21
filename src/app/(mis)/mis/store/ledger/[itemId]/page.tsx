import { isUuid } from '@/lib/mis/ids';
import { notFound } from 'next/navigation';
import { requireMisAccess } from '@/server/mis/guard';
import { listStoreTxns, listStockSummary } from '@/server/mis/store';
import { StoreLedgerScreen } from '@/components/mis/store/store-ledger-screen';

type Props = { params: Promise<{ itemId: string }> };

export default async function StoreLedgerPage({ params }: Props) {
  await requireMisAccess();
  const { itemId } = await params;
  if (!isUuid(itemId)) notFound();

  const [txns, summary] = await Promise.all([
    listStoreTxns(itemId),
    listStockSummary(),
  ]);

  const stockRow = summary.find((r) => r.id === itemId);
  if (!stockRow) notFound();

  const item = {
    id: stockRow.id,
    name: stockRow.name,
    code: stockRow.code,
    sku: stockRow.sku,
    unit: stockRow.unit,
    stockBalance: stockRow.stockBalance,
  };

  return <StoreLedgerScreen item={item} txns={txns} />;
}
