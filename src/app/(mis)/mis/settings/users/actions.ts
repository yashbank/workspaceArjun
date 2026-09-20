'use server';

import { revalidatePath } from 'next/cache';

import type { MisRoleName } from '@/lib/mis/roles';
import { grantMisRole, inviteMisUser, type InviteMisUserResult } from '@/server/mis/users';

export async function inviteMisUserAction(
  email: string,
  role: MisRoleName,
): Promise<InviteMisUserResult> {
  const result = await inviteMisUser(email, role);
  revalidatePath('/mis/settings/users');
  return result;
}

export async function grantMisRoleAction(userProfileId: string, role: MisRoleName) {
  await grantMisRole(userProfileId, role);
  revalidatePath('/mis/settings/users');
}
