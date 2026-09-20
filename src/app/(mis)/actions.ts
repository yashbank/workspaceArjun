'use server';

import { revalidatePath } from 'next/cache';

import { toLocale, type Locale } from '@/lib/mis/i18n';
import { getCurrentUser } from '@/server/auth';
import { isMisEnabled } from '@/server/mis/flags';
import { setLocale } from '@/server/mis/preferences';

/**
 * Persist the language toggle.
 *
 * Re-checks the flag rather than trusting the caller: a server action is a
 * public endpoint, so "the UI only renders this for flagged users" is not a
 * check.
 */
export async function setLocaleAction(next: Locale): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isMisEnabled(user.id)) return;

  await setLocale(user.id, toLocale(next));
  revalidatePath('/mis');
}
