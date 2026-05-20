import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { inviteUserByEmail } from '@/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { assertSeatAvailable, getSeatUsage, isInvitableRole } from '@/server/users';
import type { UserProfile, UserRole } from '@/generated/prisma/client';

export interface UserListItem {
  id: string;
  authId: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: string;
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

export interface AdminUsersResponse {
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

export async function listUsersWithSeats(): Promise<AdminUsersResponse> {
  await requirePermission('users:manage');

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
    seats: {
      max: seats.max,
      used: seats.used,
      active: seats.active,
      pendingInvites: seats.pendingInvites,
      available: seats.available,
    },
    users,
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
  const actor = await requirePermission('users:manage');

  if (!isInvitableRole(role)) {
    throw new Error('Invalid invite role. Choose admin, member, or viewer.');
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error('Email is required');

  const existing = await db.userProfile.findFirst({ where: { email: normalized } });
  if (existing) throw new Error('A user with this email already exists');

  const pending = await db.userInvite.findFirst({
    where: { email: normalized, status: 'pending' },
  });
  if (pending) throw new Error('An invite is already pending for this email');

  await assertSeatAvailable();

  await inviteUserByEmail(normalized, role);

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
  const actor = await requirePermission('users:manage');

  const invite = await db.userInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.status !== 'pending') {
    throw new Error('Pending invite not found');
  }

  const existing = await db.userProfile.findFirst({ where: { email: invite.email } });
  if (existing) {
    throw new Error('This user has already accepted the invite and is active');
  }

  await inviteUserByEmail(invite.email, invite.role);

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

export async function changeUserRole(
  userId: string,
  newRole: UserRole,
): Promise<UserProfile> {
  const actor = await requirePermission('users:manage');

  const target = await db.userProfile.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');

  if (target.id === actor.id && target.role === 'owner' && newRole !== 'owner') {
    throw new Error('You cannot demote yourself from owner');
  }

  if (newRole === 'owner' && target.role !== 'owner') {
    throw new Error('Cannot assign owner role through the admin panel');
  }

  if (target.role === 'owner' && newRole !== 'owner') {
    const ownerCount = await db.userProfile.count({ where: { role: 'owner' } });
    if (ownerCount <= 1) throw new Error('Cannot demote the only owner');
  }

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

  if (status === 'active' && target.status === 'deactivated') {
    await assertSeatAvailable();
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
  const actor = await requirePermission('users:manage');

  const target = await db.userProfile.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');

  if (target.id === actor.id) {
    throw new Error('You cannot remove your own account');
  }

  if (target.role === 'owner') {
    throw new Error('Cannot remove an owner account');
  }

  if (target.status !== 'deactivated') {
    throw new Error('Only deactivated users can be removed. Deactivate the account first.');
  }

  const [fileCount, folderCount] = await Promise.all([
    db.file.count({ where: { ownerId: userId, deletedAt: null } }),
    db.folder.count({ where: { ownerId: userId, deletedAt: null } }),
  ]);

  if (fileCount > 0 || folderCount > 0) {
    throw new Error(
      'This user still owns files or folders. Reassign or delete their content before removal.',
    );
  }

  const admin = await createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(target.authId);
  if (error) throw new Error(error.message);

  await db.userProfile.delete({ where: { id: userId } });

  await logAuditEvent({
    actor,
    action: 'user.remove',
    targetType: 'user',
    targetId: userId,
    meta: { email: target.email, role: target.role },
  });
}
