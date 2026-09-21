'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { masterSpec } from '@/lib/mis/master-directory';
import { saveMaster, setMasterDeactivated } from '@/server/mis/master-directory';

/**
 * The form actions behind D10's edit panel.
 *
 * Thin on purpose: `saveMaster` / `setMasterDeactivated` hold the permission check, and the `createX` / `updateX`
 * / `deleteX` they call hold the audit write. The place to go back to comes from the master's own route — never
 * from the form — so a posted value cannot become an open redirect. `redirect()` throws to leave the action, so
 * it is always called OUTSIDE the try/catch that turns a failure into a message.
 */

export type SaveState = {
  error: string | null;
  /** What was typed, handed back so a failed save does not blank the form. */
  values?: Record<string, string>;
};

const RESERVED = new Set(['master', 'id']);

export async function saveMasterAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const master = String(formData.get('master') ?? '');
  const spec = masterSpec(master);
  if (!spec) return { error: 'Unknown master' };
  const id = String(formData.get('id') ?? '') || null;

  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (!RESERVED.has(key) && !key.startsWith('$ACTION') && typeof value === 'string') values[key] = value;

  try {
    await saveMaster(master, id, values);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save', values };
  }
  revalidatePath(spec.href);
  redirect(spec.href);
}

export async function setDeactivatedAction(formData: FormData): Promise<void> {
  const master = String(formData.get('master') ?? '');
  const spec = masterSpec(master);
  if (!spec) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  let failure: string | null = null;
  try {
    await setMasterDeactivated(master, id, formData.get('deactivate') === '1');
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Could not change the status';
  }
  revalidatePath(spec.href);
  redirect(failure ? `${spec.href}?edit=${encodeURIComponent(id)}&error=${encodeURIComponent(failure.slice(0, 200))}` : `${spec.href}?deactivated=1`);
}
