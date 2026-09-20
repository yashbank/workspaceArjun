'use server';
import { revalidatePath } from 'next/cache';
import { createSupplier, updateSupplier, deleteSupplier, restoreSupplier } from '@/server/mis/supplier';

export async function saveSupplierAction(id: string | null, values: any) {
  if (id) { await updateSupplier(id, values); } else { await createSupplier(values); }
  revalidatePath('/mis/suppliers');
}
export async function deleteSupplierAction(id: string) { await deleteSupplier(id); revalidatePath('/mis/suppliers'); }
export async function restoreSupplierAction(id: string) { await restoreSupplier(id); revalidatePath('/mis/suppliers'); }
