'use server';
import { revalidatePath } from 'next/cache';
import { createCustomer, updateCustomer, deleteCustomer, restoreCustomer } from '@/server/mis/customer';

export async function saveCustomerAction(id: string | null, values: any) {
  if (id) { await updateCustomer(id, values); } else { await createCustomer(values); }
  revalidatePath('/mis/customers');
}
export async function deleteCustomerAction(id: string) { await deleteCustomer(id); revalidatePath('/mis/customers'); }
export async function restoreCustomerAction(id: string) { await restoreCustomer(id); revalidatePath('/mis/customers'); }
