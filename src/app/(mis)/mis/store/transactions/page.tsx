import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listAllStoreTxnsPage, listIssueTargets, listStoreItems } from '@/server/mis/store';
import { StoreTransactionsScreen } from '@/components/mis/store/store-transactions-screen';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function StoreTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; itemId?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireMisAccess();
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  const type = sp.type === 'IN' || sp.type === 'OUT' ? sp.type : undefined;
  const from = sp.from && DAY.test(sp.from) ? sp.from : undefined;
  const to = sp.to && DAY.test(sp.to) ? sp.to : undefined;
  const itemId = sp.itemId || undefined;

  const [paged, items, canWrite, targets] = await Promise.all([
    listAllStoreTxnsPage({ q, type, itemId, from, to, page: sp.page }),
    listStoreItems(),
    checkPermission('store.write'),
    listIssueTargets(),
  ]);

  return (
    <StoreTransactionsScreen
      txns={paged.rows}
      items={items}
      canWrite={canWrite}
      targets={targets}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), params: { q, type, itemId, from, to } }}
    />
  );
}
