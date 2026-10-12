'use server';
import { revalidatePath } from 'next/cache';
import { asResult } from '@/lib/mis/action-result';
import { createSupplier, updateSupplier, deleteSupplier, restoreSupplier, type SupplierInput } from '@/server/mis/supplier';

export async function saveSupplierAction(id: string | null, values: SupplierInput) {
  return asResult(async () => {
    if (id) { await updateSupplier(id, values); } else { await createSupplier(values); }
    revalidatePath('/mis/suppliers');
  }, { entity: 'Supplier', fields: values });
}
export async function deleteSupplierAction(id: string) { await deleteSupplier(id); revalidatePath('/mis/suppliers'); }
export async function restoreSupplierAction(id: string) { await restoreSupplier(id); revalidatePath('/mis/suppliers'); }
