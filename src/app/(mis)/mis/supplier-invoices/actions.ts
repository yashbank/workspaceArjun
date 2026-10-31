'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { reconcileSupplierInvoice, signOffInvoiceVariance } from '@/server/mis/supplier-invoice';

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
