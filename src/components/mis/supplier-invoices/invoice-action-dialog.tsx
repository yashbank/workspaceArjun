'use client';
import { useEffect, useState, useTransition } from 'react';

import { approveInvoiceForPaymentAction, markInvoicePaidAction, rejectSupplierInvoiceAction, signOffInvoiceVarianceAction } from '@/app/(mis)/mis/supplier-invoices/actions';
import { Button } from '@/components/mis/kit/button';
import { unwrap } from '@/lib/mis/action-result';
import { isPaymentStatus } from '@/lib/mis/invoice-match';
import type { SupplierInvoiceRow } from '@/server/mis/supplier-invoice';

const fmtDate = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
const INPUT = 'min-h-11 rounded-lg border border-slate-300 px-3 text-base';
const isDiscrepancy = (r: SupplierInvoiceRow) => r.status === 'DISCREPANCY_QTY' || r.status === 'DISCREPANCY_PRICE';

/** R2-374: whether a row has anything to show or do in the status actions. */
export const hasInvoiceActions = (r: SupplierInvoiceRow, canReconcile: boolean, canSignOff: boolean) =>
  canReconcile || canSignOff || !!r.signedOff || isDiscrepancy(r) || isPaymentStatus(r.status);

/**
 * R2-374: sign-off / approve / pay / reject controls for ONE invoice. Draft text lives in this component's own state,
 * so each row is isolated (typing in one invoice never touches another). Same server actions as before.
 */
export function InvoiceActions({ row: r, canReconcile, canSignOff, onDone }: { row: SupplierInvoiceRow; canReconcile: boolean; canSignOff: boolean; onDone?: () => void }) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [signNote, setSignNote] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payRef, setPayRef] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null);
      try { await fn(); onDone?.(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not save.'); }
    });

  // R2-280: a discrepancy invoice is not paid until the Owner has signed its variance off, on the record.
  const signOffControl = r.signedOff ? (
    <p className="text-xs text-emerald-800">Variance signed off by the Owner · {fmtDate(r.signedOff.at)}{r.signedOff.note ? ` · ${r.signedOff.note}` : ''}</p>
  ) : isDiscrepancy(r) ? (
    canSignOff ? (
      <span className="flex flex-wrap items-center gap-2">
        <input aria-label="Sign-off note" className={INPUT} placeholder="Note (optional)" value={signNote} onChange={(e) => setSignNote(e.target.value)} />
        <Button variant="secondary" disabled={busy} onClick={() => act(async () => { unwrap(await signOffInvoiceVarianceAction(r.id, signNote || null)); setSignNote(''); })}>Sign off variance</Button>
      </span>
    ) : (
      <p className="text-xs text-amber-900">Not to be paid until the Owner signs off the variance.</p>
    )
  ) : null;

  // R2-288: the Owner approves payment (a matched invoice, or a signed-off discrepancy); Admin / Owner records the payment or rejects.
  let payment: React.ReactNode;
  if (r.status === 'PAID') payment = <p className="text-xs text-slate-700">Paid {r.payment?.paymentDate ? fmtDate(r.payment.paymentDate) : ''}{r.payment?.paymentRef ? ` · Ref ${r.payment.paymentRef}` : ''}</p>;
  else if (r.status === 'REJECTED') payment = <p className="text-xs text-slate-700">Rejected{r.payment?.rejectReason ? ` · ${r.payment.rejectReason}` : ''}</p>;
  else {
    const mayApprove = canSignOff && (r.status === 'MATCHED' || (isDiscrepancy(r) && !!r.signedOff));
    payment = (
      <span className="mt-1 flex flex-wrap items-center gap-2">
        {mayApprove && <Button variant="secondary" disabled={busy} onClick={() => act(async () => unwrap(await approveInvoiceForPaymentAction(r.id)))}>Approve for payment</Button>}
        {r.status === 'APPROVED_FOR_PAYMENT' && canReconcile && (
          <>
            <input aria-label="Payment date" type="date" className={INPUT} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            <input aria-label="UTR / cheque number" className={INPUT} placeholder="UTR / cheque no." value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            <Button disabled={busy || !payDate || payRef.trim().length < 3} onClick={() => act(async () => { unwrap(await markInvoicePaidAction(r.id, { paymentDate: payDate, paymentRef: payRef.trim() })); setPayDate(''); setPayRef(''); })}>Mark paid</Button>
          </>
        )}
        {canReconcile && !isPaymentStatus(r.status) && (
          <>
            <input aria-label="Reject reason" className={INPUT} placeholder="Reason to reject" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <Button variant="secondary" disabled={busy || rejectReason.trim().length < 3} onClick={() => act(async () => { unwrap(await rejectSupplierInvoiceAction(r.id, rejectReason.trim())); setRejectReason(''); })}>Reject</Button>
          </>
        )}
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {signOffControl}
      {payment}
      {error && <p role="alert" className="text-xs font-medium text-red-800">{error}</p>}
    </div>
  );
}

/** R2-375: compact table cell. A button opens a modal dialog holding this one invoice's actions. */
export function InvoiceActionDialog({ row, canReconcile, canSignOff }: { row: SupplierInvoiceRow; canReconcile: boolean; canSignOff: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Update status</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={`Update status for ${row.invoiceNo}`} className="w-full max-w-lg rounded-2xl bg-white p-5 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">Update status · {row.invoiceNo}</h2>
            <div className="mt-3">
              <InvoiceActions row={row} canReconcile={canReconcile} canSignOff={canSignOff} onDone={() => setOpen(false)} />
            </div>
            <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => setOpen(false)}>Close</Button></div>
          </div>
        </div>
      )}
    </>
  );
}
