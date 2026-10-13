'use server';
import { revalidatePath } from 'next/cache';
import { isMisForbiddenError } from '@/server/mis/auth';
import { createOrder, isOrderStatusError, OrderReopenError, reopenOrder, updateOrder, updateOrderStatus } from '@/server/mis/orders';
import type { CloseGate } from '@/lib/mis/order-transitions';
import { asResult, type ActionResult } from '@/lib/mis/action-result';
import { addDocument } from '@/server/mis/documents';

export async function saveOrderAction(id: string | null, values: { customerId?: string | null; description?: string | null; deliveryDate?: string | null; notes?: string | null }): Promise<ActionResult> {
  return asResult(async () => {
    if (id) { await updateOrder(id, values); } else { await createOrder(values); }
    revalidatePath('/mis/orders');
    if (id) revalidatePath(`/mis/orders/${id}`);
  });
}

export type OrderStatusOutcome = { ok: true } | { ok: false; detail: string; gates?: CloseGate[]; openItems?: string[] };

/**
 * Returns an outcome rather than throwing, for the same reason `reopenOrderAction` does: a
 * refusal a person can act on (illegal move, unmet gates, "give a reason") must reach the
 * screen as words, not as a generic production-build error.
 */
export async function updateOrderStatusAction(id: string, status: string, reason?: string, confirmOpenItems?: boolean): Promise<OrderStatusOutcome> {
  try {
    await updateOrderStatus(id, status, confirmOpenItems ? { reason, confirmOpenItems } : { reason });
  } catch (error) {
    if (isOrderStatusError(error)) return { ok: false, detail: error.message, gates: error.gates, openItems: error.openItems };
    if (isMisForbiddenError(error)) return { ok: false, detail: 'You do not have permission to change an order\'s status.' };
    throw error;
  }
  revalidatePath('/mis/orders');
  revalidatePath(`/mis/orders/${id}`);
  revalidatePath('/mis/production');
  return { ok: true };
}

/**
 * E5-09 (MIS-108/132/133): a customer PO is captured as a document hanging off the order
 * (`S6-Documents.png`'s own pattern — a name and a link, same shape every generated/uploaded
 * file on an order uses), never a structured field — `mis_purchase_orders` already has its own,
 * unrelated `bomRef`/`purpose` and this is a different "PO" entirely (a customer's paper, not a
 * supplier purchase order; see D3's note in bom.test.ts). Thin wrapper over the existing,
 * unmodified `documents.ts` module so the order screen can offer "attach the customer's PO"
 * without a second document-storage path.
 */
export async function addOrderDocumentAction(orderId: string, data: { name: string; description?: string; filePath: string }): Promise<ActionResult> {
  return asResult(async () => {
    await addDocument(orderId, data);
    revalidatePath(`/mis/orders/${orderId}`);
  });
}

/**
 * Returns an outcome rather than throwing: in a production build a thrown error
 * reaches the browser as a generic string, so "give a reason" would arrive as
 * "an error occurred" (Appendix B §B.10.3). Only the two failures a person can
 * act on come back as data; anything else stays an exception.
 */
export async function reopenOrderAction(id: string, reason: string) {
  try {
    await reopenOrder(id, reason);
  } catch (error) {
    if (error instanceof OrderReopenError) return { ok: false as const, detail: error.message };
    if (isMisForbiddenError(error)) return { ok: false as const, detail: 'You do not have permission to reopen an order.' };
    throw error;
  }
  revalidatePath('/mis/orders');
  revalidatePath(`/mis/orders/${id}`);
  revalidatePath('/mis/production');
  return { ok: true as const };
}
