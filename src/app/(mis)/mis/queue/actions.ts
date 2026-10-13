'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { discardParkedWrite } from '@/server/mis/idempotency';
import { resolveParkedWrite } from '@/server/mis/queue-resolve';

/**
 * R3 B127: both actions return an `ActionResult`. A resolve can also fail to land WITHOUT
 * throwing (the world has not changed yet): that stays an ordinary `ok: true` value whose
 * `outcome`/`reason`/`detail` the screen reads, never a park forced through.
 */
export async function resolveParkedWriteAction(key: string, note: string) {
  return asResult(async () => {
    const r = await resolveParkedWrite(key, note);
    revalidatePath('/mis/queue');
    return { outcome: r.outcome, reason: r.reason ?? null, detail: r.detail ?? null };
  });
}

export async function discardParkedWriteAction(key: string, reason: string) {
  return asResult(async () => {
    await discardParkedWrite(key, reason);
    revalidatePath('/mis/queue');
  });
}
