import { cache } from 'react';

import { db } from '@/server/db';
import type { MisRoleName } from '@/lib/mis/roles';

/**
 * Resolve a user's MIS role.
 *
 * Returns null for anyone with no MIS employee record — including every worker,
 * who by design has no login at all. Null is the normal answer, not an error.
 *
 * Cached per request so a layout, a page and three server components asking the
 * same question cost one query.
 */
export const getMisRole = cache(async (userId: string): Promise<MisRoleName | null> => {
  if (!userId) return null;

  const employee = await db.misEmployee.findUnique({
    where: { userProfileId: userId },
    select: { role: true, deletedAt: true, isActive: true },
  });

  if (!employee || employee.deletedAt || !employee.isActive) return null;
  return employee.role as MisRoleName;
});

/** Does this user hold one of these roles? */
export async function hasMisRole(userId: string, roles: MisRoleName[]): Promise<boolean> {
  const role = await getMisRole(userId);
  return role !== null && roles.includes(role);
}

/** The employee record behind a login, or null. */
export const getMisEmployee = cache(async (userId: string) => {
  if (!userId) return null;
  return db.misEmployee.findUnique({ where: { userProfileId: userId } });
});
