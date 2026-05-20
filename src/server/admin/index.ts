import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { hasPermission } from '@/server/rbac/permissions';
import { logAuditEvent } from '@/server/audit';
import { inviteUserByEmail } from '@/server/auth';
import {
  assertSeatAvailable,
  getSeatUsage,
  canActorInviteRole,
  getInvitableRolesForActor,
  releaseStalePendingInvite,
  cancelPendingInvitesForEmail,
} from '@/server/users';
import { INVITE_ERROR_MESSAGES, InviteSendError } from '@/server/auth/invite-errors';
import { getInviteUrlConfig } from '@/lib/app-url';
import { checkAuthUserExists } from '@/server/admin/auth-users';
import {
  permanentlyRemoveUser,
  detachProfileReferences,
  deleteProfileRecord,
  transferOwnedContentToOwner,
} from '@/server/admin/user-removal';
import { validatePermanentRemovalGuards } from '@/server/admin/remove-user-guards';
import type { UserProfile, UserRole } from '@/generated/prisma/client';

export type UserAccountState = 'active' | 'deactivated' | 'auth_missing';

export interface UserListItem {
  id: string;
  authId: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: string;
  accountState: UserAccountState;
  authExists: boolean;
  createdAt: Date;
}

export interface PendingInviteItem {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  invitedAt: Date;
  invitedByEmail: string | null;
}

export interface InviteUrlConfig {
  appUrl: string;
  appUrlSource: string;
  inviteCallbackUrl: string;
  recoveryCallbackUrl: string;
  warnings: string[];
  productionFallback: string;
}

export interface AdminUsersResponse {
  actorRole: UserRole;
  invitableRoles: UserRole[];
  inviteUrlConfig: InviteUrlConfig;
  seats: {
    max: number;
    used: number;
    active: number;
    pendingInvites: number;
    available: number;
  };
  users: UserListItem[];
  invites: PendingInviteItem[];
}

async function assertCanChangeRoleAsync(
  actor: UserProfile,
  target: UserProfile,
  newRole: UserRole,
): Promise<void> {
  if (target.id === actor.id && target.role === 'owner' && newRole !== 'owner') {
    throw new Error('You cannot demote yourself from owner');
  }

  if (newRole === 'owner' && target.role !== 'owner') {
    throw new Error('Use transfer ownership to assign a new owner');
  }

  if (target.role === 'owner' && newRole !== 'owner') {
    const ownerCount = await db.userProfile.count({ where: { role: 'owner' } });
    if (ownerCount <= 1) throw new Error('Cannot demote the only owner');
  }

  if (actor.role === 'admin') {
    if (target.role === 'owner' || target.role === 'admin') {
      throw new Error('Admins cannot modify owner or admin accounts');
    }
    if (newRole === 'owner' || newRole === 'admin') {
      throw new Error('Admins can only assign member or viewer roles');
    }
  }
}

export async function listUsersWithSeats(): Promise<AdminUsersResponse> {
  const actor = await requirePermission('users:manage');

  const [seats, users, invites] = await Promise.all([
    getSeatUsage(),
    db.userProfile.findMany({
      select: {
        id: true,
        authId: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    }),
    db.userInvite.findMany({
      where: { status: 'pending' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        invitedAt: true,
        inviter: { select: { email: true } },
      },
      orderBy: { invitedAt: 'desc' },
    }),
  ]);

  return {
    actorRole: actor.role,
    invitableRoles: getInvitableRolesForActor(actor.role),
    inviteUrlConfig: getInviteUrlConfig(),
    seats: {
      max: seats.max,
      used: seats.used,
      active: seats.active,
      pendingInvites: seats.pendingInvites,
      available: seats.available,
    },
    users: await enrichUsersWithAuthState(users),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      status: i.status,
      invitedAt: i.invitedAt,
      invitedByEmail: i.inviter.email,
    })),
  };
}

export async function inviteUser(email: string, role: UserRole): Promise<void> {
  const actor = await requirePermission('users:invite');

  if (!canActorInviteRole(actor.role, role)) {
    throw new Error(
      actor.role === 'admin'
        ? 'Admins can only invite members.'
        : 'You are not allowed to invite users with this role.',
    );
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error('Email is required');

  const existing = await db.userProfile.findFirst({ where: { email: normalized } });
  if (existing) throw new Error(INVITE_ERROR_MESSAGES.user_exists);

  await releaseStalePendingInvite(normalized);

  const pending = await db.userInvite.findFirst({
    where: { email: normalized, status: 'pending' },
  });
  if (pending) throw new Error(INVITE_ERROR_MESSAGES.pending_invite);

  await assertSeatAvailable();

  try {
    await inviteUserByEmail(normalized, role);
  } catch (error) {
    if (error instanceof InviteSendError && error.code === 'user_exists') {
      await cancelPendingInvitesForEmail(normalized);
    }
    throw error;
  }

  await db.userInvite.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      role,
      status: 'pending',
      invitedBy: actor.id,
    },
    update: {
      role,
      status: 'pending',
      invitedBy: actor.id,
      invitedAt: new Date(),
      acceptedAt: null,
    },
  });

  await logAuditEvent({
    actor,
    action: 'user.invite',
    targetType: 'user',
    meta: { email: normalized, role },
  });
}

export async function resendInvite(inviteId: string): Promise<void> {
  const actor = await requirePermission('users:invite');

  const invite = await db.userInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.status !== 'pending') {
    throw new Error('Pending invite not found');
  }

  if (!canActorInviteRole(actor.role, invite.role)) {
    throw new Error('You are not allowed to resend this invite.');
  }

  const existing = await db.userProfile.findFirst({ where: { email: invite.email } });
  if (existing) {
    throw new Error('This user has already accepted the invite and is active');
  }

  try {
    await inviteUserByEmail(invite.email, invite.role);
  } catch (error) {
    if (error instanceof InviteSendError && error.code === 'user_exists') {
      await cancelPendingInvitesForEmail(invite.email);
    }
    throw error;
  }

  await db.userInvite.update({
    where: { id: inviteId },
    data: { invitedAt: new Date() },
  });

  await logAuditEvent({
    actor,
    action: 'user.invite_resend',
    targetType: 'user',
    targetId: inviteId,
    meta: { email: invite.email, role: invite.role },
  });
}

export async function cancelInvite(inviteId: string): Promise<void> {
  const actor = await requirePermission('users:invite');

  const invite = await db.userInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.status !== 'pending') {
    throw new Error('Pending invite not found');
  }

  if (!canActorInviteRole(actor.role, invite.role)) {
    throw new Error('You are not allowed to cancel this invite.');
  }

  await db.userInvite.update({
    where: { id: inviteId },
    data: { status: 'cancelled' },
  });

  await logAuditEvent({
    actor,
    action: 'user.invite_cancel',
    targetType: 'user',
    targetId: inviteId,
    meta: { email: invite.email, role: invite.role },
  });
}

export async function changeUserRole(
  userId: string,
  newRole: UserRole,
): Promise<UserProfile> {
  const actor = await requirePermission('users:manage');

  const target = await db.userProfile.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');

  await assertCanChangeRoleAsync(actor, target, newRole);

  const updated = await db.userProfile.update({
    where: { id: userId },
    data: { role: newRole },
  });

  await logAuditEvent({
    actor,
    action: 'user.role_change',
    targetType: 'user',
    targetId: userId,
    meta: { email: target.email, oldRole: target.role, newRole },
  });

  return updated;
}

export async function setUserStatus(
  userId: string,
  status: 'active' | 'deactivated',
): Promise<UserProfile> {
  const actor = await requirePermission('users:manage');

  const target = await db.userProfile.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');

  if (target.id === actor.id) {
    throw new Error('You cannot change your own account status');
  }

  if (target.role === 'owner') {
    throw new Error('Cannot deactivate or reactivate an owner account');
  }

  if (actor.role === 'admin' && target.role === 'admin') {
    throw new Error('Admins cannot deactivate admin accounts');
  }

  if (status === 'active' && target.status === 'deactivated') {
    await assertSeatAvailable();
    const authExists = await checkAuthUserExists(target.authId);
    if (!authExists) {
      throw new Error(
        'This user no longer has a Supabase login. Use Invite again instead of reactivate.',
      );
    }
  }

  const updated = await db.userProfile.update({
    where: { id: userId },
    data: { status },
  });

  const action = status === 'deactivated' ? 'user.deactivate' : 'user.reactivate';
  await logAuditEvent({
    actor,
    action,
    targetType: 'user',
    targetId: userId,
    meta: { email: target.email, status },
  });

  return updated;
}

export async function removeUser(userId: string): Promise<void> {
  const actor = await requirePermission('users:remove');

  const target = await db.userProfile.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');

  const guard = validatePermanentRemovalGuards({
    actorId: actor.id,
    actorRole: actor.role,
    targetId: target.id,
    targetRole: target.role,
  });
  if (!guard.ok) throw new Error(guard.message);

  const authExists = await checkAuthUserExists(target.authId);

  if (target.status !== 'deactivated' && authExists) {
    throw new Error('Only deactivated users can be removed. Deactivate the account first.');
  }

  try {
    const transfer = await permanentlyRemoveUser({
      userId: target.id,
      authId: target.authId,
      email: target.email,
      fallbackOwnerId: actor.id,
      authExists,
    });
    console.info('[admin.removeUser] completed', {
      userId: target.id.slice(0, 8),
      authExists,
      filesTransferred: transfer.filesTransferred,
      foldersTransferred: transfer.foldersTransferred,
    });
  } catch (err) {
    console.error('[admin.removeUser] failed', {
      userId: target.id.slice(0, 8),
      email: target.email,
      step: err instanceof Error ? err.message.slice(0, 80) : 'unknown',
    });
    throw err;
  }

  await logAuditEvent({
    actor,
    action: 'user.remove',
    targetType: 'user',
    targetId: userId,
    meta: {
      email: target.email,
      role: target.role,
      authWasPresent: authExists,
    },
  });
}

/** Re-invite when profile exists but Supabase Auth user was deleted. */
export async function inviteAgainForEmail(email: string, role: UserRole): Promise<void> {
  const actor = await requirePermission('users:invite');

  if (!canActorInviteRole(actor.role, role)) {
    throw new Error('You are not allowed to invite users with this role.');
  }

  const normalized = email.trim().toLowerCase();
  const profile = await db.userProfile.findFirst({ where: { email: normalized } });

  if (profile) {
    const authExists = await checkAuthUserExists(profile.authId);
    if (authExists) {
      if (profile.status === 'deactivated') {
        throw new Error('This user still has a login account. Use Reactivate instead.');
      }
      throw new Error('An active user with this email already exists.');
    }

    const owner = await db.userProfile.findFirst({
      where: { role: 'owner', status: 'active' },
      select: { id: true },
    });
    if (!owner) throw new Error('No active owner found for reference cleanup');

    await transferOwnedContentToOwner(profile.id, owner.id);
    await detachProfileReferences(profile.id, profile.email, owner.id);
    await deleteProfileRecord(profile.id);
  }

  await inviteUser(normalized, role);
}

export async function transferOwnership(newOwnerId: string): Promise<void> {
  const actor = await requirePermission('users:transfer_ownership');

  if (actor.role !== 'owner') {
    throw new Error('Only the workspace owner can transfer ownership');
  }

  const target = await db.userProfile.findUnique({ where: { id: newOwnerId } });
  if (!target) throw new Error('User not found');

  if (target.id === actor.id) {
    throw new Error('You are already the owner');
  }

  if (target.status !== 'active') {
    throw new Error('Ownership can only be transferred to an active user');
  }

  if (target.role === 'owner') {
    throw new Error('This user is already an owner');
  }

  await db.$transaction([
    db.userProfile.update({
      where: { id: newOwnerId },
      data: { role: 'owner' },
    }),
    db.userProfile.update({
      where: { id: actor.id },
      data: { role: 'admin' },
    }),
  ]);

  await logAuditEvent({
    actor,
    action: 'user.ownership_transfer',
    targetType: 'user',
    targetId: newOwnerId,
    meta: { email: target.email, previousOwnerEmail: actor.email },
  });
}

/** Roles the actor may assign when editing an existing user. */
export function getAssignableRolesForActor(
  actorRole: UserRole,
  targetRole: UserRole,
): UserRole[] {
  if (targetRole === 'owner') return ['owner'];
  if (actorRole === 'owner') return ['admin', 'member', 'viewer'];
  if (actorRole === 'admin') return ['member', 'viewer'];
  return [];
}

export function canActorRemoveUser(actor: UserProfile): boolean {
  return actor.role === 'owner' && hasPermission(actor.role, 'users:remove');
}

async function enrichUsersWithAuthState(
  users: {
    id: string;
    authId: string;
    email: string;
    name: string | null;
    role: UserRole;
    status: string;
    createdAt: Date;
  }[],
): Promise<UserListItem[]> {
  const authChecks = await Promise.all(
    users.map(async (u) => ({
      id: u.id,
      exists: await checkAuthUserExists(u.authId),
    })),
  );
  const authMap = new Map(authChecks.map((c) => [c.id, c.exists]));

  return users.map((u) => {
    const authExists = authMap.get(u.id) ?? false;
    const accountState: UserAccountState =
      u.status === 'active' ? 'active' : authExists ? 'deactivated' : 'auth_missing';
    return {
      ...u,
      authExists,
      accountState,
    };
  });
}
