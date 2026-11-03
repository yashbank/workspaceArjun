import type { SupplierInvoiceRow } from '@/server/mis/supplier-invoice';

/** R2-377: CSV of the rows on screen. Quantity / money columns exist only when the role's rows carry them. */
const cell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export function buildInvoiceCsv(rows: SupplierInvoiceRow[]): string {
  const hasFigures = rows.some((r) => r.figures);
  const hasMoney = rows.some((r) => r.money);
  const head = ['Invoice', 'PO', 'GRN', 'Supplier', 'Date', 'Status'];
  if (hasFigures) head.push('Billed qty', 'Received qty', 'Amount off %');
  if (hasMoney) head.push('Expected', 'Invoice amount', 'Difference');
  const lines = [head.map(cell).join(',')];
  for (const r of rows) {
    const c: unknown[] = [r.invoiceNo, r.poNumber, r.grnNumber, r.supplierName, day(r.invoiceDate), r.status];
    if (hasFigures) c.push(r.figures?.billedQty, r.figures?.receivedQty, r.figures?.variancePct);
    if (hasMoney) c.push(r.money?.expected, r.money?.invoiced, r.money?.variance);
    lines.push(c.map(cell).join(','));
  }
  return lines.join('\r\n');
}

export function downloadInvoiceCsv(rows: SupplierInvoiceRow[]) {
  const url = URL.createObjectURL(new Blob([buildInvoiceCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'supplier-invoices.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
