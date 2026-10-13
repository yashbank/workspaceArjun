'use server';
import { revalidatePath } from 'next/cache';
import { asResult, type ActionResult } from '@/lib/mis/action-result';
import { createCustomer, updateCustomer, deleteCustomer, restoreCustomer, type CustomerInput } from '@/server/mis/customer';

export async function saveCustomerAction(id: string | null, values: CustomerInput) {
  return asResult(async () => {
    if (id) { await updateCustomer(id, values); } else { await createCustomer(values); }
    revalidatePath('/mis/customers');
  }, { entity: 'Customer', fields: values });
}
export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  return asResult(async () => { await deleteCustomer(id); revalidatePath('/mis/customers'); }, { entity: 'Customer' });
}
export async function restoreCustomerAction(id: string): Promise<ActionResult> {
  return asResult(async () => { await restoreCustomer(id); revalidatePath('/mis/customers'); }, { entity: 'Customer' });
}
