'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { voidProductionLog } from '@/server/mis/production';

/**
 * R2-17: delete (void) a production entry — Admin/Owner within 7 days, with a reason. Returns an
 * `ActionResult` so a refusal reaches the screen as text; a permission refusal is still thrown.
 */
export async function voidProductionLogAction(id: string, reason: string) {
  return asResult(async () => {
    const rec = await voidProductionLog(id, reason);
    revalidatePath('/mis/production');
    revalidatePath(`/mis/production/${rec.orderId}`);
    revalidatePath(`/mis/orders/${rec.orderId}`);
    revalidatePath('/mis/machine-board');
    return { id: rec.id, orderId: rec.orderId };
  });
}
