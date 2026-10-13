'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { reconcileSupplierInvoice } from '@/server/mis/supplier-invoice';

export async function reconcileSupplierInvoiceAction(id: string) {
  // A refusal travels as data (R3-STK B21); a permission refusal is still thrown for the error boundary.
  return asResult(async () => {
    const result = await reconcileSupplierInvoice(id);
    revalidatePath('/mis/supplier-invoices');
    return result;
  });
}
