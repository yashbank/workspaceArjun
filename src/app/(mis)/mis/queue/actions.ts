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
  const result = await asResult(async () => {
    const r = await resolveParkedWrite(key, note);
    return { outcome: r.outcome, reason: r.reason ?? null, detail: r.detail ?? null };
  });
  if (result.ok) revalidatePath('/mis/queue');
  return result;
}

export async function discardParkedWriteAction(key: string, reason: string) {
  const result = await asResult(async () => {
    await discardParkedWrite(key, reason);
  });
  if (result.ok) revalidatePath('/mis/queue');
  return result;
}
