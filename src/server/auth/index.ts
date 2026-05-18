import { cache } from 'react';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { db } from '@/server/db';
import type { UserProfile, UserRole } from '@/generated/prisma/client';

/**
 * Auto-creates a UserProfile when a Supabase user authenticates for the first
 * time. The very first profile in the system is promoted to `owner`; all
 * subsequent profiles default to `member`.
 */
async function ensureProfile(authUser: {
  id: string;
  email?: string;
}): Promise<UserProfile> {
  const existing = await db.userProfile.findUnique({
    where: { authId: authUser.id },
  });
  if (existing) return existing;

  const profileCount = await db.userProfile.count();
  const role: UserRole = profileCount === 0 ? 'owner' : 'member';

  try {
    return await db.userProfile.create({
      data: {
        authId: authUser.id,
        email: authUser.email ?? '',
        role,
        status: 'active',
      },
    });
  } catch {
    // Race condition: another concurrent request created the profile first.
    const profile = await db.userProfile.findUnique({
      where: { authId: authUser.id },
    });
    if (profile) return profile;
    throw new Error('Failed to create user profile');
  }
}

/**
 * Returns the authenticated user's profile, auto-creating it if needed.
 * De-duplicated per-request via React `cache()`.
 */
export const getCurrentUser = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return ensureProfile(user);
});

export async function requireUser(): Promise<UserProfile> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  if (user.status === 'deactivated') {
    throw new Error('Account deactivated');
  }
  return user;
}

export async function inviteUserByEmail(email: string, role: UserRole) {
  const admin = await createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_role: role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/`,
  });

  if (error) throw error;
  return data;
}
