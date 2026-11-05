'use server';

import { revalidatePath } from 'next/cache';

import { isMisForbiddenError } from '@/server/mis/auth';
import { saveOrgTheme } from '@/server/mis/theme';

/** Outcome as a value (React hides a thrown server-action message in production). */
export async function saveThemeAction(paletteId: string, fontPairId: string): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    await saveOrgTheme({ paletteId, fontPairId });
    revalidatePath('/mis', 'layout');
    return { ok: true };
  } catch (error) {
    if (isMisForbiddenError(error)) return { ok: false, detail: 'Only the Owner can change the theme.' };
    if (error instanceof Error && /from the list/.test(error.message)) return { ok: false, detail: error.message };
    throw error;
  }
}
