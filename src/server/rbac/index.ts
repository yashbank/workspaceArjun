import type { UserRole } from '@/generated/prisma/client';
import { requireUser } from '@/server/auth';
import { hasPermission } from './permissions';
import type { Permission } from './permissions';

export { hasPermission, isAdmin } from './permissions';
export type { Permission } from './permissions';

export async function requireRole(...roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new Error('Forbidden');
  }
  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!hasPermission(user.role, permission)) {
    throw new Error('Forbidden');
  }
  return user;
}
