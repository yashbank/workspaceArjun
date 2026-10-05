'use server';
import { revalidatePath } from 'next/cache';
import { createItem, updateItem, deleteItem, restoreItem, type ItemInput } from '@/server/mis/item';

export async function saveItemAction(id: string | null, values: ItemInput) {
  if (id) { await updateItem(id, values); } else { await createItem(values); }
  revalidatePath('/mis/masters/items');
}
export async function deleteItemAction(id: string) { await deleteItem(id); revalidatePath('/mis/masters/items'); }
export async function restoreItemAction(id: string) { await restoreItem(id); revalidatePath('/mis/masters/items'); }
