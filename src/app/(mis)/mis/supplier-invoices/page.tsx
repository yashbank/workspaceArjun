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
  // R2-280: `wages.read` is the Owner's gate (D24): only the Owner signs off a variance.
  const [paged, canReconcile, canSignOff] = await Promise.all([listSupplierInvoicesPage({ q, status, page: sp.page }), checkPermission('supplier_invoice.write'), checkPermission('wages.read')]);
  return (
    <SupplierInvoicesScreen
      rows={paged.rows}
      canReconcile={canReconcile}
      canSignOff={canSignOff}
      paging={{ total: paged.total, page: clampPage(parsePage(sp.page), paged.total), status: status ?? '', q, counts: paged.counts }}
    />
  );
}
