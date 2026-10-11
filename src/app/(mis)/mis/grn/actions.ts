'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { createGRN, addGRNItem, updateGRNItem, updateGRNHeader, confirmGRN, type GrnHeaderInput, type GrnItemInput } from '@/server/mis/grn';

export async function createGrnAction(poId: string, notes?: string | null) {
  const grn = await createGRN({ poId, notes });
  revalidatePath('/mis/grn');
  return grn.id;
}

export async function updateGrnHeaderAction(grnId: string, patch: GrnHeaderInput) {
  return asResult(async () => {
    await updateGRNHeader(grnId, patch);
    revalidatePath(`/mis/grn/${grnId}`);
  });
}

export async function addGrnItemAction(grnId: string, input: GrnItemInput) {
  // "Received + damaged is more than the challan" must reach the storekeeper as words.
  return asResult(async () => {
    await addGRNItem(grnId, input);
    revalidatePath(`/mis/grn/${grnId}`);
  });
}

export async function updateGrnItemAction(id: string, grnId: string, patch: Partial<GrnItemInput>) {
  return asResult(async () => {
    await updateGRNItem(id, patch);
    revalidatePath(`/mis/grn/${grnId}`);
  });
}

export async function confirmGrnAction(grnId: string) {
  await confirmGRN(grnId);
  revalidatePath(`/mis/grn/${grnId}`);
  revalidatePath('/mis/grn');
  revalidatePath('/mis/inventory');
}
