'use server';
import { revalidatePath } from 'next/cache';
import { isMisForbiddenError } from '@/server/mis/auth';
import { createOrder, OrderReopenError, reopenOrder, updateOrder, updateOrderStatus } from '@/server/mis/orders';

export async function saveOrderAction(id: string | null, values: { customerId?: string | null; description?: string | null; deliveryDate?: string | null; notes?: string | null }) {
  if (id) { await updateOrder(id, values); } else { await createOrder(values); }
  revalidatePath('/mis/orders');
}

export async function updateOrderStatusAction(id: string, status: string) {
  await updateOrderStatus(id, status);
  revalidatePath('/mis/orders');
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
