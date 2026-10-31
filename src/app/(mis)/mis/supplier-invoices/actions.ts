'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { approveInvoiceForPayment, markInvoicePaid, reconcileSupplierInvoice, rejectSupplierInvoice, signOffInvoiceVariance } from '@/server/mis/supplier-invoice';

export async function reconcileSupplierInvoiceAction(id: string) {
  // A refusal travels as data (R3-STK B21); a permission refusal is still thrown for the error boundary.
  return asResult(async () => {
    const result = await reconcileSupplierInvoice(id);
    revalidatePath('/mis/supplier-invoices');
    return result;
  });
}

/** R2-280: the Owner signs off a discrepancy invoice's variance. */
export async function signOffInvoiceVarianceAction(id: string, note?: string | null) {
  return asResult(async () => {
    const result = await signOffInvoiceVariance(id, note);
    revalidatePath('/mis/supplier-invoices');
    return result;
  });
}

/** R2-288: payment states. */
export async function approveInvoiceForPaymentAction(id: string) {
  return asResult(async () => { const r = await approveInvoiceForPayment(id); revalidatePath('/mis/supplier-invoices'); return r; });
}
export async function markInvoicePaidAction(id: string, input: { paymentDate: string; paymentRef: string }) {
  return asResult(async () => { const r = await markInvoicePaid(id, input); revalidatePath('/mis/supplier-invoices'); return r; });
}
export async function rejectSupplierInvoiceAction(id: string, reason: string) {
  return asResult(async () => { const r = await rejectSupplierInvoice(id, reason); revalidatePath('/mis/supplier-invoices'); return r; });
}
