import type { UserRole } from '@/generated/prisma/client';

const INVITABLE_ROLES: UserRole[] = ['admin', 'member', 'viewer'];
const ALL_ROLES: UserRole[] = ['owner', 'admin', 'member', 'viewer'];

export function parseInvitedRole(userMetadata: unknown): UserRole | null {
  if (!userMetadata || typeof userMetadata !== 'object') return null;
  const role = (userMetadata as Record<string, unknown>).invited_role;
  if (typeof role !== 'string') return null;
  return ALL_ROLES.includes(role as UserRole) ? (role as UserRole) : null;
}

export function resolveProfileRole(options: {
  profileCount: number;
  invitedRole: UserRole | null;
}): UserRole {
  if (options.profileCount === 0) return 'owner';
  if (options.invitedRole && options.invitedRole !== 'owner') {
    return options.invitedRole;
  }
  if (options.invitedRole === 'owner') {
    return 'member';
  }
  return 'member';
}

export function isInvitableRole(role: string): role is 'admin' | 'member' | 'viewer' {
  return INVITABLE_ROLES.includes(role as UserRole);
}

export const INVITABLE_ROLE_OPTIONS = INVITABLE_ROLES;
