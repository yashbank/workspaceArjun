'use server';
import { revalidatePath } from 'next/cache';

import { reconcileSupplierInvoice } from '@/server/mis/supplier-invoice';

export async function reconcileSupplierInvoiceAction(id: string) {
  const result = await reconcileSupplierInvoice(id);
  revalidatePath('/mis/supplier-invoices');
  return result;
}
