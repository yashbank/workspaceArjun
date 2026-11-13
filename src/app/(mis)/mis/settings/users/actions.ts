'use server';

import { revalidatePath } from 'next/cache';

import { asResult, type ActionResult } from '@/lib/mis/action-result';
import type { MisRoleName } from '@/lib/mis/roles';
import { adminChangeEmail, adminResetPassword } from '@/server/mis/account';
import { grantMisRole, inviteMisUser, type InviteMisUserResult } from '@/server/mis/users';

export async function inviteMisUserAction(
  email: string,
  role: MisRoleName,
): Promise<ActionResult<InviteMisUserResult>> {
  return asResult(async () => {
    const result = await inviteMisUser(email, role);
    revalidatePath('/mis/settings/users');
    return result;
  }, { entity: 'User' });
}

export async function grantMisRoleAction(userProfileId: string, role: MisRoleName) {
  return asResult(async () => {
    await grantMisRole(userProfileId, role);
    revalidatePath('/mis/settings/users');
  }, { entity: 'User' });
}

export async function adminResetPasswordAction(userProfileId: string): Promise<ActionResult<{ temporaryPassword: string }>> {
  return asResult(() => adminResetPassword(userProfileId), { entity: 'Password' });
}

export async function adminChangeEmailAction(userProfileId: string, email: string): Promise<ActionResult<{ email: string }>> {
  return asResult(async () => {
    const r = await adminChangeEmail(userProfileId, email);
    revalidatePath('/mis/settings/users');
    return r;
  }, { entity: 'Email' });
}
