import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { inviteUserByEmail } from '@/server/auth';
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

export async function listUsers(): Promise<UserListItem[]> {
  await requirePermission('users:manage');
  return db.userProfile.findMany({
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
  });
}

export async function inviteUser(email: string, role: UserRole): Promise<void> {
  const actor = await requirePermission('users:manage');

  const existing = await db.userProfile.findFirst({ where: { email } });
  if (existing) throw new Error('A user with this email already exists');

  await inviteUserByEmail(email, role);

  await logAuditEvent({
    actor,
    action: 'user.invite',
    targetType: 'user',
    meta: { email, role },
  });
}

export async function changeUserRole(
  userId: string,
  newRole: UserRole,
): Promise<UserProfile> {
  const actor = await requirePermission('users:manage');

  const target = await db.userProfile.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');

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

  if (target.id === actor.id) throw new Error('You cannot deactivate yourself');

  if (target.role === 'owner' && status === 'deactivated') {
    throw new Error('Cannot deactivate an owner. Change role first.');
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
