'use server';
import { revalidatePath } from 'next/cache';
import {
  commitIssue,
  commitReceipt,
  createStoreIn,
  createStoreOut,
  recordPhysicalCount,
  updateStoreItemProps,
  deactivateStoreItem,
} from '@/server/mis/store';
import type {
  CartCommitResult,
  CartLineInput,
  IssueMeta,
  ReceiptMeta,
  StoreInInput,
  StoreOutInput,
  PhysicalCountInput,
  StoreItemUpdateInput,
} from '@/server/mis/store';

export async function storeInAction(input: StoreInInput) {
  const result = await createStoreIn(input);
  revalidatePath('/mis/store');
  revalidatePath('/mis/store/stock');
  revalidatePath('/mis/store/dashboard');
  revalidatePath('/mis/store/transactions');
  revalidatePath(`/mis/store/ledger/${input.itemId}`);
  return result;
}

export async function storeOutAction(input: StoreOutInput) {
  const result = await createStoreOut(input);
  revalidatePath('/mis/store');
  revalidatePath('/mis/store/stock');
  revalidatePath('/mis/store/dashboard');
  revalidatePath('/mis/store/transactions');
  revalidatePath(`/mis/store/ledger/${input.itemId}`);
  return result;
}

export async function physicalCountAction(input: PhysicalCountInput) {
  const result = await recordPhysicalCount(input);
  revalidatePath('/mis/store/stock');
  return result;
}

export async function updateStoreItemAction(id: string, patch: StoreItemUpdateInput) {
  await updateStoreItemProps(id, patch);
  revalidatePath('/mis/store');
  revalidatePath('/mis/store/stock');
  revalidatePath('/mis/store/dashboard');
}

export async function deactivateStoreItemAction(id: string) {
  await deactivateStoreItem(id);
  revalidatePath('/mis/store');
  revalidatePath('/mis/store/stock');
  revalidatePath('/mis/store/dashboard');
}

// ---------------------------------------------------------------------------
// The cart commits
// ---------------------------------------------------------------------------
//
// Both are one server round trip for a whole delivery or a whole issue. The
// permission check, the balance check and the transaction all live in
// @/server/mis/store — this file only decides what to re-render afterwards.

/** Everything touched by a stock movement, re-rendered after one commit. */
function revalidateStock(): void {
  revalidatePath('/mis');
  revalidatePath('/mis/store');
  revalidatePath('/mis/store/stock');
  revalidatePath('/mis/store/dashboard');
  revalidatePath('/mis/store/transactions');
  revalidatePath('/mis/store/receive');
  revalidatePath('/mis/store/issue');
  revalidatePath('/mis/inventory');
  revalidatePath('/mis/grn');
}

/** GRN receive: STORE_GUY, ADMIN, OWNER — gated on `grn.write` inside commitReceipt. */
export async function commitReceiptAction(
  lines: CartLineInput[],
  meta: ReceiptMeta,
): Promise<CartCommitResult> {
  const result = await commitReceipt(lines, meta);
  revalidateStock();
  return result;
}

/** Issue to production: STORE_GUY, ADMIN, OWNER — gated on `store.write` inside commitIssue. */
export async function commitIssueAction(
  lines: CartLineInput[],
  meta: IssueMeta,
): Promise<CartCommitResult> {
  const result = await commitIssue(lines, meta);
  revalidateStock();
  return result;
}
