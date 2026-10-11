import { SupplierInvoicesScreen } from '@/components/mis/supplier-invoices/supplier-invoices-screen';
import { checkPermission } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { listSupplierInvoices } from '@/server/mis/supplier-invoice';

export default async function SupplierInvoicesPage() {
  await requireMisAccess();
  const [rows, canReconcile] = await Promise.all([listSupplierInvoices(), checkPermission('supplier_invoice.write')]);
  return <SupplierInvoicesScreen rows={rows} canReconcile={canReconcile} />;
}
