import { cache } from 'react';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { db } from '@/server/db';
import { parseInvitedRole, resolveProfileRole } from '@/server/users';
import { throwMappedInviteError } from '@/server/auth/invite-errors';
import type { UserProfile, UserRole } from '@/generated/prisma/client';

const INVITE_ACCEPT_PATH = '/invite/accept';

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export async function markInviteAccepted(email: string): Promise<void> {
  if (!email) return;
  await db.userInvite.updateMany({
    where: { email: email.toLowerCase(), status: 'pending' },
    data: { status: 'accepted', acceptedAt: new Date() },
  });
}

export async function hasPendingInviteForEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const invite = await db.userInvite.findFirst({
    where: { email: normalized, status: 'pending' },
  });
  return !!invite;
}

/**
 * Invited users with a valid session but no password yet should finish /invite/accept.
 */
export async function userNeedsPasswordSetup(authUser: {
  email?: string;
}): Promise<boolean> {
  if (!authUser.email) return false;
  return hasPendingInviteForEmail(authUser.email);
}

/**
 * Auto-creates a UserProfile when a Supabase user authenticates for the first
 * time. The first profile becomes owner; invited users receive their invited_role.
 */
export async function ensureProfile(authUser: {
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
 * After invite password is set — create profile and mark invite accepted.
 */
export async function completeInviteAcceptance(authUser: {
  id: string;
  email?: string;
  user_metadata?: unknown;
}): Promise<UserProfile> {
  const profile = await ensureProfile(authUser);
  if (authUser.email) {
    await markInviteAccepted(authUser.email);
  }
  return profile;
}

/**
 * Returns the authenticated user's profile, auto-creating it if needed.
 * Skips auto-create while a pending invite exists (user must finish /invite/accept).
 */
export const getCurrentUser = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const pendingInvite = await hasPendingInviteForEmail(user.email ?? '');
  if (pendingInvite) return null;

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

/** Sends Supabase invite email — user sets password on /invite/accept. */
export async function inviteUserByEmail(email: string, role: UserRole) {
  const admin = await createSupabaseAdminClient();
  const normalized = email.trim().toLowerCase();
  const redirectTo = `${getAppUrl()}/auth/callback?type=invite&next=${encodeURIComponent(INVITE_ACCEPT_PATH)}`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(normalized, {
    data: { invited_role: role },
    redirectTo,
  });

  if (error) {
    throwMappedInviteError(error, { email: normalized, operation: 'inviteUserByEmail' });
  }
  return data;
}

export function getInviteAcceptPath(): string {
  return INVITE_ACCEPT_PATH;
}
