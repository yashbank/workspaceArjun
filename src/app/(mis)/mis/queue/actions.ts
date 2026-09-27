'use server';
import { revalidatePath } from 'next/cache';

import { discardParkedWrite } from '@/server/mis/idempotency';
import { resolveParkedWrite } from '@/server/mis/queue-resolve';

export async function resolveParkedWriteAction(key: string, note: string) {
  // A resolve can genuinely fail to land (the world has not actually changed yet) without
  // throwing — `resolveParkedWrite` returns that as an ordinary outcome, never a park forced
  // through. The screen reads `outcome`/`reason`/`detail` to say so, rather than assuming
  // silence means success.
  const result = await resolveParkedWrite(key, note);
  revalidatePath('/mis/queue');
  return { outcome: result.outcome, reason: result.reason ?? null, detail: result.detail ?? null };
}

export async function discardParkedWriteAction(key: string, reason: string) {
  await discardParkedWrite(key, reason);
  revalidatePath('/mis/queue');
}
