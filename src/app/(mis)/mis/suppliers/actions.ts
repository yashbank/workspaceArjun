'use server';
import { revalidatePath } from 'next/cache';
import { asResult, type ActionResult } from '@/lib/mis/action-result';
import { createSupplier, updateSupplier, deleteSupplier, restoreSupplier, type SupplierInput } from '@/server/mis/supplier';

export async function saveSupplierAction(id: string | null, values: SupplierInput) {
  return asResult(async () => {
    if (id) { await updateSupplier(id, values); } else { await createSupplier(values); }
    revalidatePath('/mis/suppliers');
  }, { entity: 'Supplier', fields: values });
}
export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  return asResult(async () => { await deleteSupplier(id); revalidatePath('/mis/suppliers'); }, { entity: 'Supplier' });
}
export async function restoreSupplierAction(id: string): Promise<ActionResult> {
  return asResult(async () => { await restoreSupplier(id); revalidatePath('/mis/suppliers'); }, { entity: 'Supplier' });
}
