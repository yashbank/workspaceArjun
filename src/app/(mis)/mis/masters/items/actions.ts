'use server';
import { revalidatePath } from 'next/cache';
import { createItem, updateItem, deleteItem, restoreItem } from '@/server/mis/item';

export async function saveItemAction(id: string | null, values: { code: string; name: string; gsm?: string; size?: string; substrate?: string; coating?: string; unit?: string }) {
  if (id) { await updateItem(id, values); } else { await createItem(values as any); }
  revalidatePath('/mis/masters/items');
}
export async function deleteItemAction(id: string) { await deleteItem(id); revalidatePath('/mis/masters/items'); }
export async function restoreItemAction(id: string) { await restoreItem(id); revalidatePath('/mis/masters/items'); }
