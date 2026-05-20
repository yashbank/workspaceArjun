import { createSupabaseAdminClient } from '@/lib/supabase/server';

export async function checkAuthUserExists(authId: string): Promise<boolean> {
  if (!authId?.trim()) return false;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.warn('[auth.admin] SUPABASE_SERVICE_ROLE_KEY missing — cannot verify auth user');
    return false;
  }

  try {
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(authId);
    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('not found') || msg.includes('user not found')) {
        return false;
      }
      console.warn('[auth.admin] getUserById failed', { authId: authId.slice(0, 8), code: error.name });
      return false;
    }
    return !!data.user;
  } catch (err) {
    console.warn('[auth.admin] getUserById exception', {
      authId: authId.slice(0, 8),
      message: err instanceof Error ? err.message : 'unknown',
    });
    return false;
  }
}

export async function deleteAuthUser(authId: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured. Cannot delete auth user.');
  }

  const admin = await createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(authId);
  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('not found') || msg.includes('user not found')) {
      console.info('[auth.admin] deleteUser skipped — already removed', {
        authId: authId.slice(0, 8),
      });
      return;
    }
    console.error('[auth.admin] deleteUser failed', {
      authId: authId.slice(0, 8),
      code: error.name,
      message: error.message,
    });
    throw new Error(`Supabase Auth deletion failed: ${error.message}`);
  }
}
