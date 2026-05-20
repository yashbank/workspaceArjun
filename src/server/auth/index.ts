import { cache } from 'react';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { db } from '@/server/db';
import { parseInvitedRole, resolveProfileRole } from '@/server/users';
import type { UserProfile, UserRole } from '@/generated/prisma/client';

async function markInviteAccepted(email: string): Promise<void> {
  if (!email) return;
  await db.userInvite.updateMany({
    where: { email: email.toLowerCase(), status: 'pending' },
    data: { status: 'accepted', acceptedAt: new Date() },
  });
}

/**
 * Auto-creates a UserProfile when a Supabase user authenticates for the first
 * time. The first profile becomes owner; invited users receive their invited_role.
 */
async function ensureProfile(authUser: {
  id: string;
  email?: string;
  user_metadata?: unknown;
}): Promise<UserProfile> {
  const existing = await db.userProfile.findUnique({
    where: { authId: authUser.id },
  });
  if (existing) return existing;

  const profileCount = await db.userProfile.count();
  const invitedRole = parseInvitedRole(authUser.user_metadata);
  const role = resolveProfileRole({ profileCount, invitedRole });
  const email = (authUser.email ?? '').toLowerCase();

  try {
    const profile = await db.userProfile.create({
      data: {
        authId: authUser.id,
        email,
        role,
        status: 'active',
      },
    });
    await markInviteAccepted(email);
    return profile;
  } catch {
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
  return ensureProfile({
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata,
  });
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

/** Sends Supabase invite email — user sets their own password via the link. */
export async function inviteUserByEmail(email: string, role: UserRole) {
  const admin = await createSupabaseAdminClient();
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(normalized, {
    data: { invited_role: role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/`,
  });

  if (error) throw error;
  return data;
}
