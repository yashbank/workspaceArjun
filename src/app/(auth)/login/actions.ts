'use server';

import { db } from '@/server/db';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { validatePassword } from '@/lib/password-policy';

export async function checkBootstrapNeeded(): Promise<boolean> {
  if (process.env.ALLOW_BOOTSTRAP !== 'true') return false;
  try {
    const count = await db.userProfile.count();
    return count === 0;
  } catch {
    return false;
  }
}

/**
 * Creates the very first admin user via Supabase Admin API.
 * Guarded: only works when ALLOW_BOOTSTRAP=true AND zero profiles exist.
 * The profile is auto-created on first login via `ensureProfile()` with
 * role=owner (since it will be the first profile in the system).
 */
export async function bootstrapFirstUser(
  email: string,
  password: string,
): Promise<{ error?: string }> {
  if (process.env.ALLOW_BOOTSTRAP !== 'true') {
    return { error: 'Bootstrap is disabled.' };
  }

  try {
    const count = await db.userProfile.count();
    if (count > 0) {
      return { error: 'An admin already exists. Sign in instead.' };
    }
  } catch {
    return { error: 'Database is not reachable. Start local services first.' };
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.ok) {
    return {
      error: `Password is too weak. Needs: ${passwordCheck.errors.join(', ').toLowerCase()}.`,
    };
  }

  const admin = await createSupabaseAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) return { error: error.message };
  return {};
}
