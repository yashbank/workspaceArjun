'use server';
import { revalidatePath } from 'next/cache';
import { createGRN, addGRNItem, updateGRNItem, confirmGRN } from '@/server/mis/grn';

export async function createGrnAction(poId: string, notes?: string | null) {
  const grn = await createGRN({ poId, notes });
  revalidatePath('/mis/grn');
  return grn.id;
}

export async function addGrnItemAction(grnId: string, input: { poItemId: string; receivedQty: number; type?: 'GENERAL' | 'FOR_ORDER'; forOrderRef?: string | null; batchNo?: string | null; notes?: string | null }) {
  await addGRNItem(grnId, input);
  revalidatePath(`/mis/grn/${grnId}`);
}

export async function updateGrnItemAction(id: string, grnId: string, patch: { receivedQty?: number; type?: 'GENERAL' | 'FOR_ORDER'; forOrderRef?: string | null; batchNo?: string | null }) {
  await updateGRNItem(id, patch);
  revalidatePath(`/mis/grn/${grnId}`);
}

export async function confirmGrnAction(grnId: string) {
  await confirmGRN(grnId);
  revalidatePath(`/mis/grn/${grnId}`);
  revalidatePath('/mis/grn');
  revalidatePath('/mis/inventory');
}
