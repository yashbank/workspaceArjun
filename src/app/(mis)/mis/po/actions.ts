'use server';
import { revalidatePath } from 'next/cache';
import { createPO, updatePO, deleteDraftPO, addPOItem, updatePOItem, removePOItem, setPoLineRate, submitForApproval, approvePO, cancelPO, assertPoHeaderComplete, type PoInput } from '@/server/mis/po';
import { asResult, type ActionResult } from '@/lib/mis/action-result';

// A business refusal (unapproved BOM, empty PO, wrong status) comes back as a value, not a throw —
// a production build would otherwise replace its message with a generic "An error occurred".

export async function createPoAction(input: PoInput): Promise<ActionResult<string>> {
  return asResult(async () => {
    assertPoHeaderComplete(input); // R2-272: the delivery date is mandatory on a new PO
    const po = await createPO(input);
    revalidatePath('/mis/po');
    return po.id;
  });
}

export async function updatePoAction(poId: string, input: PoInput): Promise<ActionResult> {
  return asResult(async () => {
    await updatePO(poId, input);
    revalidatePath(`/mis/po/${poId}`);
    revalidatePath('/mis/po');
  });
}

export async function deletePoAction(poId: string): Promise<ActionResult> {
  return asResult(async () => {
    await deleteDraftPO(poId);
    revalidatePath('/mis/po');
  });
}

export async function addPoItemAction(poId: string, input: { itemId?: string | null; description: string; quantity: number; unitId?: string | null; ratePerUnit: number }): Promise<ActionResult<{ warning?: string }>> {
  return asResult(async () => {
    const line = await addPOItem(poId, input);
    revalidatePath(`/mis/po/${poId}`);
    return { warning: (line as { warning?: string }).warning }; // R2-274: a duplicate-order warning, never a block
  });
}

export async function updatePoItemAction(id: string, poId: string, patch: { description?: string; quantity?: number; ratePerUnit?: number }): Promise<ActionResult> {
  return asResult(async () => {
    await updatePOItem(id, patch);
    revalidatePath(`/mis/po/${poId}`);
  });
}

export async function removePoItemAction(id: string, poId: string): Promise<ActionResult> {
  return asResult(async () => {
    await removePOItem(id);
    revalidatePath(`/mis/po/${poId}`);
  });
}

export async function submitPoAction(poId: string): Promise<ActionResult> {
  return asResult(async () => {
    await submitForApproval(poId);
    revalidatePath(`/mis/po/${poId}`);
    revalidatePath('/mis/po');
  });
}

export async function approvePoAction(poId: string): Promise<ActionResult> {
  return asResult(async () => {
    await approvePO(poId);
    revalidatePath(`/mis/po/${poId}`);
    revalidatePath('/mis/po');
  });
}

export async function cancelPoAction(poId: string): Promise<ActionResult> {
  return asResult(async () => {
    await cancelPO(poId);
    revalidatePath(`/mis/po/${poId}`);
    revalidatePath('/mis/po');
  });
}

export async function setPoLineRateAction(id: string, poId: string, ratePerUnit: number): Promise<ActionResult> {
  return asResult(async () => {
    await setPoLineRate(id, ratePerUnit);
    revalidatePath(`/mis/po/${poId}`);
  });
}
