'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';

import { Pagination } from '@/components/mis/kit/pagination';
import { ListToolbar } from '@/components/mis/kit/list-toolbar';
import { pageHref, type ListView } from '@/lib/mis/pagination';

import { reconcileSupplierInvoiceAction } from '@/app/(mis)/mis/supplier-invoices/actions';
import { Button } from '@/components/mis/kit/button';
import { unwrap } from '@/lib/mis/action-result';
import { InvoiceActionDialog, InvoiceActions, hasInvoiceActions } from './invoice-action-dialog';
import { downloadInvoiceCsv } from './invoice-export';
import { InvoiceKpiStrip } from './invoice-kpi-strip';
import { INVOICE_STATUSES, isPaymentStatus, type InvoiceStatus } from '@/lib/mis/invoice-match';
import type { SupplierInvoiceRow } from '@/server/mis/supplier-invoice';

const LABEL: Record<InvoiceStatus, string> = {
  MATCHED: 'Matched',
  DISCREPANCY_QTY: 'Quantity differs',
  DISCREPANCY_PRICE: 'Price differs',
  PENDING_REVIEW: 'Pending review',
  // R2-288
  APPROVED_FOR_PAYMENT: 'Approved for payment',
  PAID: 'Paid',
  REJECTED: 'Rejected',
};

/** Green matched, amber quantity, red price, neutral pending (MIS_UI_SPEC §4.2). */
const CARD: Record<InvoiceStatus, string> = {
  MATCHED: 'bg-green-50 border-green-200',
  DISCREPANCY_QTY: 'bg-amber-50 border-amber-200',
  DISCREPANCY_PRICE: 'bg-red-50 border-red-200',
  PENDING_REVIEW: 'bg-white border-slate-200',
  APPROVED_FOR_PAYMENT: 'bg-indigo-50 border-indigo-200',
  PAID: 'bg-slate-50 border-slate-200',
  REJECTED: 'bg-slate-100 border-slate-300',
};
const PILL: Record<InvoiceStatus, string> = {
  MATCHED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  DISCREPANCY_QTY: 'bg-amber-50 text-amber-900 ring-amber-200',
  DISCREPANCY_PRICE: 'bg-red-50 text-red-800 ring-red-200',
  PENDING_REVIEW: 'bg-slate-100 text-slate-700 ring-slate-200',
  APPROVED_FOR_PAYMENT: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  PAID: 'bg-slate-200 text-slate-800 ring-slate-300',
  REJECTED: 'bg-slate-200 text-slate-600 ring-slate-300',
};
const ROW_TINT: Record<InvoiceStatus, string> = {
  MATCHED: '',
  DISCREPANCY_QTY: 'bg-amber-50',
  DISCREPANCY_PRICE: 'bg-red-50',
  PENDING_REVIEW: '',
  APPROVED_FOR_PAYMENT: 'bg-indigo-50',
  PAID: '',
  REJECTED: 'bg-slate-100',
};

const fmtDate = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
const fmtPct = (p: number | null | undefined) => (p === null || p === undefined ? '—' : `${p > 0 ? '+' : ''}${p}%`);
const fmtQty = (q: number | null | undefined) => (q === null || q === undefined ? '—' : String(q));

function Pill({ status }: { status: InvoiceStatus }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset ${PILL[status]}`}>{LABEL[status]}</span>;
}

type Props = {
  rows: SupplierInvoiceRow[];
  canReconcile: boolean;
  /** R2-83: the server-side page — the status filter and search are URL params, `counts` is per status over the search. */
  paging?: { total: number; page: number; status: InvoiceStatus | ''; q: string; view?: ListView; counts: Record<InvoiceStatus, number> };
  /** R2-280: the Owner may sign off a discrepancy invoice's variance. */
  canSignOff?: boolean;
};

export function SupplierInvoicesScreen({ rows, canReconcile, paging, canSignOff = false }: Props) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filter: InvoiceStatus | 'ALL' = paging ? (paging.status || 'ALL') : 'ALL';
  const shown = rows;
  const count = (s: InvoiceStatus) => (paging ? paging.counts[s] : rows.filter((r) => r.status === s).length);
  const allCount = paging ? INVOICE_STATUSES.reduce((n, s) => n + paging.counts[s], 0) : rows.length;
  const q = paging?.q ?? '';
  const view = paging?.view;
  const chipHref = (s: InvoiceStatus | '') => pageHref('/mis/supplier-invoices', { q, status: s, view }, 1);
  const hasFigures = rows.some((r) => r.figures);
  const hasMoney = rows.some((r) => r.money);

  const [voucher, setVoucher] = useState<SupplierInvoiceRow | null>(null);
  // R2-377: print one invoice's voucher (the print stylesheet shows only [data-voucher]).
  const printVoucher = (r: SupplierInvoiceRow) => {
    setVoucher(r);
    setTimeout(() => window.print(), 0);
  };
  const kpis = paging
    ? { total: allCount, matched: paging.counts.MATCHED, discrepancies: paging.counts.DISCREPANCY_QTY + paging.counts.DISCREPANCY_PRICE, approved: paging.counts.APPROVED_FOR_PAYMENT }
    : { total: rows.length, matched: count('MATCHED'), discrepancies: count('DISCREPANCY_QTY') + count('DISCREPANCY_PRICE'), approved: count('APPROVED_FOR_PAYMENT') };
  const reconcile = (id: string) =>
    startTransition(async () => {
      setError(null);
      try {
        unwrap(await reconcileSupplierInvoiceAction(id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not re-check this invoice.');
      }
    });

  return (
    <div className="w-full p-4 md:p-6 flex flex-col gap-3 pb-24">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">Supplier invoices</h1>
        <p className="text-sm text-slate-600 mt-1">Each invoice checked against the purchase order rate and what the store actually received.</p>
      </div>

      <InvoiceKpiStrip kpis={kpis} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by match status">
        <FilterChip active={filter === 'ALL'} href={chipHref('')}>All ({allCount})</FilterChip>
        {INVOICE_STATUSES.map((s) => (
          <FilterChip key={s} active={filter === s} href={chipHref(s)}>{LABEL[s]} ({count(s)})</FilterChip>
        ))}
      </div>

      <ListToolbar basePath="/mis/supplier-invoices" params={{ q, status: paging?.status, view }} searchLabel="Search invoice, PO or supplier…" view={view} />
      <div className="flex justify-end">
        <Button type="button" variant="secondary" disabled={shown.length === 0} onClick={() => downloadInvoiceCsv(shown)}>Export CSV</Button>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</div>}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-700">No supplier invoices here yet.</div>
      ) : (
        <>
          {/* Phone: card stack */}
          <ul className={`flex flex-col gap-3 ${view === 'rows' ? 'hidden' : view ? '' : 'md:hidden'}`}>
            {shown.map((r) => (
              <li key={r.id} className={`rounded-2xl border p-4 ${CARD[r.status]}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{r.invoiceNo}</p>
                    <p className="font-mono text-xs text-slate-600">{r.poNumber}{r.grnNumber ? ` · ${r.grnNumber}` : ''}</p>
                  </div>
                  <Pill status={r.status} />
                </div>
                <p className="text-sm text-slate-700 mt-1">{r.supplierName ?? 'No supplier'} · {fmtDate(r.invoiceDate)}</p>
                {r.figures && (
                  <p className="text-sm text-slate-800 mt-2">
                    Billed {fmtQty(r.figures.billedQty)} · Received {fmtQty(r.figures.receivedQty)} · Amount off {fmtPct(r.figures.variancePct)}
                  </p>
                )}
                {r.money && (
                  <p className="text-sm text-slate-900 mt-1">
                    Expected {r.money.expected} · Invoice {r.money.invoiced ?? '—'} · Difference {r.money.variance ?? '—'}
                  </p>
                )}
                <div className="mt-2"><InvoiceActions row={r} canReconcile={canReconcile} canSignOff={canSignOff} /></div>
                <Button variant="secondary" className="mt-3" block onClick={() => printVoucher(r)}>Print Voucher</Button>
                {canReconcile && !isPaymentStatus(r.status) && (
                  <Button variant="secondary" className="mt-3" block disabled={busy} onClick={() => reconcile(r.id)}>Re-check match</Button>
                )}
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className={`relative w-full ${view === 'rows' ? '' : view ? 'hidden' : 'hidden md:block'}  min-w-0 max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white`}>
            <table className="w-full text-sm text-left text-slate-900">
              <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3">Invoice</th>
                  <th className="p-3">PO / GRN</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                  {hasFigures && <><th className="p-3 text-right">Billed qty</th><th className="p-3 text-right">Received</th><th className="p-3 text-right">Amount off</th></>}
                  {hasMoney && <><th className="p-3 text-right">Expected</th><th className="p-3 text-right">Invoice</th><th className="p-3 text-right">Difference</th></>}
                  <th className="p-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-100 last:border-0 ${ROW_TINT[r.status]}`}>
                    <td className="p-3 font-semibold">{r.invoiceNo}</td>
                    <td className="p-3 font-mono text-xs text-slate-700">{r.poNumber}{r.grnNumber ? ` · ${r.grnNumber}` : ''}</td>
                    <td className="p-3">{r.supplierName ?? '—'}</td>
                    <td className="p-3">{fmtDate(r.invoiceDate)}</td>
                    <td className="p-3"><Pill status={r.status} /></td>
                    {hasFigures && <>
                      <td className="p-3 text-right">{fmtQty(r.figures?.billedQty)}</td>
                      <td className="p-3 text-right">{fmtQty(r.figures?.receivedQty)}</td>
                      <td className="p-3 text-right">{fmtPct(r.figures?.variancePct)}</td>
                    </>}
                    {hasMoney && <>
                      <td className="p-3 text-right">{r.money?.expected ?? '—'}</td>
                      <td className="p-3 text-right">{r.money?.invoiced ?? '—'}</td>
                      <td className="p-3 text-right">{r.money?.variance ?? '—'}</td>
                    </>}
                    <td className="p-3 text-right">
                      <span className="inline-flex flex-wrap justify-end gap-2">
                        {hasInvoiceActions(r, canReconcile, canSignOff) && <InvoiceActionDialog row={r} canReconcile={canReconcile} canSignOff={canSignOff} />}
                        {canReconcile && !isPaymentStatus(r.status) && <Button variant="secondary" disabled={busy} onClick={() => reconcile(r.id)}>Re-check</Button>}
                        <Button variant="secondary" onClick={() => printVoucher(r)}>Print Voucher</Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <style>{`[data-voucher]{display:none}@media print{body *{visibility:hidden}[data-voucher],[data-voucher] *{visibility:visible}[data-voucher]{display:block;position:absolute;left:0;top:0;padding:24px}}`}</style>
      {voucher && (
        <div data-voucher aria-hidden="true">
          <h2 className="text-xl font-bold">Supplier invoice voucher</h2>
          <p>Invoice {voucher.invoiceNo} · {fmtDate(voucher.invoiceDate)}</p>
          <p>PO {voucher.poNumber}{voucher.grnNumber ? ` · GRN ${voucher.grnNumber}` : ''}</p>
          <p>Supplier: {voucher.supplierName ?? '—'}</p>
          <p>Status: {LABEL[voucher.status]}</p>
          {voucher.figures && <p>Billed {fmtQty(voucher.figures.billedQty)} · Received {fmtQty(voucher.figures.receivedQty)} · Amount off {fmtPct(voucher.figures.variancePct)}</p>}
          {voucher.money && <p>Expected {voucher.money.expected} · Invoice {voucher.money.invoiced ?? '—'} · Difference {voucher.money.variance ?? '—'}</p>}
        </div>
      )}
      {paging && <Pagination basePath="/mis/supplier-invoices" params={{ q, status: paging.status, view }} page={paging.page} total={paging.total} />}
    </div>
  );
}

function FilterChip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
    >
      {children}
    </Link>
  );
}
