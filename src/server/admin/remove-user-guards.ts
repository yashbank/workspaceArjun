import { hasPermission } from '@/server/rbac';

export type RemoveUserGuardInput = {
  actorId: string;
  actorRole: string;
  targetId: string;
  targetRole: string;
};

export type RemoveUserGuardResult =
  | { ok: true }
  | { ok: false; message: string };

/** Pure guards for permanent removal (owner-only, not self, not owner target). */
export function validatePermanentRemovalGuards(input: RemoveUserGuardInput): RemoveUserGuardResult {
  if (input.actorRole !== 'owner' || !hasPermission(input.actorRole as 'owner', 'users:remove')) {
    return { ok: false, message: 'Only the workspace owner can permanently remove users' };
  }
  if (input.targetId === input.actorId) {
    return { ok: false, message: 'You cannot remove your own account' };
  }
  if (input.targetRole === 'owner') {
    return { ok: false, message: 'Cannot remove an owner account' };
  }
  return { ok: true };
}
