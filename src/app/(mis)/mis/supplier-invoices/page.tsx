import { SupplierInvoicesScreen } from '@/components/mis/supplier-invoices/supplier-invoices-screen';
import { checkPermission } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { listSupplierInvoicesPage } from '@/server/mis/supplier-invoice';
import { MATCH_STATUSES, type MatchStatus } from '@/lib/mis/invoice-match';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function SupplierInvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireMisAccess();
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  const status = (MATCH_STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as MatchStatus) : undefined;
  const [paged, canReconcile] = await Promise.all([listSupplierInvoicesPage({ q, status, page: sp.page }), checkPermission('supplier_invoice.write')]);
  return (
    <SupplierInvoicesScreen
      rows={paged.rows}
      canReconcile={canReconcile}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), status: status ?? '', q, counts: paged.counts }}
    />
  );
}
