'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { createGRN, addGRNItem, updateGRNItem, updateGRNHeader, confirmGRN, removeGRNItem, discardGRN, type GrnHeaderInput, type GrnItemInput } from '@/server/mis/grn';

export async function createGrnAction(poId: string, notes?: string | null) {
  // Refusals travel as data: in production a thrown message is replaced by a generic one.
  return asResult(async () => {
    const grn = await createGRN({ poId, notes });
    revalidatePath('/mis/grn');
    return grn.id;
  });
}

export async function updateGrnHeaderAction(grnId: string, patch: GrnHeaderInput) {
  return asResult(async () => {
    const saved = await updateGRNHeader(grnId, patch);
    revalidatePath(`/mis/grn/${grnId}`);
    return { warnings: saved.warnings };
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

export async function removeGrnItemAction(id: string, grnId: string) {
  return asResult(async () => {
    await removeGRNItem(id);
    revalidatePath(`/mis/grn/${grnId}`);
  });
}

export async function discardGrnAction(grnId: string) {
  return asResult(async () => {
    await discardGRN(grnId);
    revalidatePath('/mis/grn');
  });
}

/** `overReceiptReason`: an Admin/Owner's reason to take more than the order + 2% (R3-STK B03). */
export async function confirmGrnAction(grnId: string, overReceiptReason?: string | null) {
  // "Already confirmed", "more than is outstanding" and "add at least one item" must reach the storekeeper as words.
  return asResult(async () => {
    const confirmed = await confirmGRN(grnId, { overReceiptReason });
    revalidatePath(`/mis/grn/${grnId}`);
    revalidatePath('/mis/grn');
    revalidatePath('/mis/inventory');
    revalidatePath('/mis/store/stock');
    revalidatePath('/mis/store/transactions');
    // B12: an advisory note (e.g. the invoice is already on another PO); nothing at all when there is none.
    const warnings = confirmed?.warnings;
    return warnings && warnings.length > 0 ? { warnings } : undefined;
  });
}
