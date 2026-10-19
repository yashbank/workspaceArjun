'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { voidQcCheck } from '@/server/mis/qc';

/**
 * R2-34: delete (void) a QC check — Admin/Owner within 7 days; a QC inspector their own check on the
 * same day. Returns an `ActionResult`; a permission refusal is still thrown.
 */
export async function voidQcCheckAction(id: string, reason: string) {
  return asResult(async () => {
    const rec = await voidQcCheck(id, reason);
    revalidatePath('/mis/qc');
    revalidatePath('/mis/qc/grid');
    revalidatePath(`/mis/qc/${rec.orderId}`);
    return { id: rec.id, orderId: rec.orderId };
  });
}
