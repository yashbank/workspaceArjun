import type { UserRole } from '@/generated/prisma/client';

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
  return 'member';
}

/** Roles an actor may assign when inviting (server-enforced). */
export function getInvitableRolesForActor(actorRole: UserRole): UserRole[] {
  if (actorRole === 'owner') return ['admin', 'member'];
  if (actorRole === 'admin') return ['member'];
  return [];
}

export function canActorInviteRole(actorRole: UserRole, role: UserRole): boolean {
  return getInvitableRolesForActor(actorRole).includes(role);
}

export function isInvitableRole(role: string): role is UserRole {
  return ALL_ROLES.includes(role as UserRole) && role !== 'owner' && role !== 'viewer';
}
