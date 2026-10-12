'use server';
import { revalidatePath } from 'next/cache';
import { asResult } from '@/lib/mis/action-result';
import { createCustomer, updateCustomer, deleteCustomer, restoreCustomer, type CustomerInput } from '@/server/mis/customer';

export async function saveCustomerAction(id: string | null, values: CustomerInput) {
  return asResult(async () => {
    if (id) { await updateCustomer(id, values); } else { await createCustomer(values); }
    revalidatePath('/mis/customers');
  }, { entity: 'Customer', fields: values });
}
export async function deleteCustomerAction(id: string) { await deleteCustomer(id); revalidatePath('/mis/customers'); }
export async function restoreCustomerAction(id: string) { await restoreCustomer(id); revalidatePath('/mis/customers'); }
