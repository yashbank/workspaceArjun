'use server';
import { revalidatePath } from 'next/cache';
import { createPO, addPOItem, updatePOItem, removePOItem, submitForApproval, approvePO, cancelPO } from '@/server/mis/po';
import type { PoPurpose } from '@/lib/mis/po-purpose';

export async function createPoAction(input: { supplierId?: string | null; purpose?: PoPurpose; bomRef?: string | null; notes?: string | null }) {
  const po = await createPO(input);
  revalidatePath('/mis/po');
  return po.id;
}

export async function addPoItemAction(poId: string, input: { itemId?: string | null; description: string; quantity: number; unitId?: string | null; ratePerUnit: number }) {
  await addPOItem(poId, input);
  revalidatePath(`/mis/po/${poId}`);
}

export async function updatePoItemAction(id: string, poId: string, patch: { description?: string; quantity?: number; ratePerUnit?: number }) {
  await updatePOItem(id, patch);
  revalidatePath(`/mis/po/${poId}`);
}

export async function removePoItemAction(id: string, poId: string) {
  await removePOItem(id);
  revalidatePath(`/mis/po/${poId}`);
}

export async function submitPoAction(poId: string) {
  await submitForApproval(poId);
  revalidatePath(`/mis/po/${poId}`);
  revalidatePath('/mis/po');
}

export async function approvePoAction(poId: string) {
  await approvePO(poId);
  revalidatePath(`/mis/po/${poId}`);
  revalidatePath('/mis/po');
}

export async function cancelPoAction(poId: string) {
  await cancelPO(poId);
  revalidatePath(`/mis/po/${poId}`);
  revalidatePath('/mis/po');
}
