import { createClient } from '@supabase/supabase-js';

import { validatePassword } from '@/lib/password-policy';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { generateTempPassword } from '@/lib/mis/golive-users';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { getMisRole } from './roles';

/**
 * Account self-service and Admin/Owner resets (go-live).
 *
 * Own password: current + new (policy-checked). The current one is verified against Supabase with a
 * throwaway anon client (no cookies touched), then the change is applied with the service role so the
 * must_change_password flag can be cleared in the same call.
 * Own email: Supabase's own change flow (verification mail if the project requires it).
 * Admin reset: Owner may reset anyone; Admin may reset anyone EXCEPT an Owner. Audit rows never carry a
 * password, a hash or a temp password; only "a reset happened" and, for email, the two addresses.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
  return email;
}

function assertStrong(password: string) {
  const check = validatePassword(password);
  if (!check.ok) throw new Error(`Password must include: ${check.errors.join(', ').toLowerCase()}.`);
}

async function requireSelf() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Please sign in again.');
  return user;
}

export async function changeOwnPassword(currentPassword: string, newPassword: string, confirm: string): Promise<void> {
  const user = await requireSelf();
  if (!currentPassword) throw new Error('Enter your current password.');
  assertStrong(newPassword);
  if (newPassword !== confirm) throw new Error('New passwords do not match.');
  if (newPassword === currentPassword) throw new Error('Choose a password different from the current one.');

  const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: badCurrent } = await verifier.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (badCurrent) throw new Error('Current password is wrong.');

  const admin = await createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.authId, {
    password: newPassword,
    user_metadata: { must_change_password: false },
  });
  if (error) throw new Error('Could not change the password. Try again.');

  await logAuditEvent({ actorId: user.id, action: 'account.password.change', entity: 'UserProfile', entityId: user.id });
}

export type OwnEmailResult = { status: 'changed' | 'pending'; email: string };

export async function changeOwnEmail(newEmailRaw: string): Promise<OwnEmailResult> {
  const user = await requireSelf();
  const email = normalizeEmail(newEmailRaw);
  if (email === user.email.toLowerCase()) throw new Error('That is already your email.');
  if (await db.userProfile.findFirst({ where: { email } })) throw new Error('That email is already in use.');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.updateUser({ email });
  if (error) throw new Error(error.message || 'Could not change the email. Try again.');

  // Supabase leaves new_email set while a confirmation mail is outstanding; email === new once applied.
  const applied = data.user?.email?.toLowerCase() === email;
  if (applied) await db.userProfile.update({ where: { id: user.id }, data: { email } });

  await logAuditEvent({
    actorId: user.id,
    action: applied ? 'account.email.change' : 'account.email.change_requested',
    entity: 'UserProfile',
    entityId: user.id,
    before: { email: user.email },
    after: { email },
  });
  return { status: applied ? 'changed' : 'pending', email };
}

/** Pulls a confirmed Supabase email change into UserProfile (called when the account page opens). */
export async function syncOwnProfileEmail(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const authEmail = data.user?.email?.toLowerCase();
  if (!authEmail || authEmail === user.email.toLowerCase()) return;
  if (await db.userProfile.findFirst({ where: { email: authEmail } })) return;
  await db.userProfile.update({ where: { id: user.id }, data: { email: authEmail } });
  await logAuditEvent({
    actorId: user.id,
    action: 'account.email.change',
    entity: 'UserProfile',
    entityId: user.id,
    before: { email: user.email },
    after: { email: authEmail },
  });
}

/** Whether the signed-in person is still on a temporary password (Supabase user_metadata flag). */
export async function mustChangePassword(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.user_metadata?.must_change_password === true;
}

async function loadTarget(actorRole: string, targetProfileId: string) {
  const target = await db.userProfile.findUnique({ where: { id: targetProfileId } });
  if (!target) throw new Error('User not found.');
  const targetRole = await getMisRole(target.id);
  if (targetRole === 'OWNER' && actorRole !== 'OWNER') {
    throw new Error('Only the Owner can reset the Owner account.');
  }
  return target;
}

/** Admin/Owner: set a temporary password (generated when none is given). Returned once, never stored or audited. */
export async function adminResetPassword(targetProfileId: string, newPassword?: string): Promise<{ temporaryPassword: string }> {
  const actor = await requirePermission('employees.write');
  const target = await loadTarget(actor.role, targetProfileId);
  const password = newPassword?.trim() ? newPassword : generateTempPassword();
  assertStrong(password);

  const admin = await createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(target.authId, {
    password,
    user_metadata: { must_change_password: true },
  });
  if (error) throw new Error('Could not reset the password. Try again.');

  await logAuditEvent({
    actorId: actor.userId,
    action: 'account.password.reset',
    entity: 'UserProfile',
    entityId: target.id,
    after: { targetEmail: target.email, mustChange: true },
  });
  return { temporaryPassword: password };
}

/** Admin/Owner: change a user's login email (applied at once, no mail needed: the admin vouches for it). */
export async function adminChangeEmail(targetProfileId: string, newEmailRaw: string): Promise<{ email: string }> {
  const actor = await requirePermission('employees.write');
  const target = await loadTarget(actor.role, targetProfileId);
  const email = normalizeEmail(newEmailRaw);
  if (email === target.email.toLowerCase()) throw new Error('That is already their email.');
  if (await db.userProfile.findFirst({ where: { email, id: { not: target.id } } })) throw new Error('That email is already in use.');

  const admin = await createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(target.authId, { email, email_confirm: true });
  if (error) throw new Error('Could not change the email. Try again.');
  await db.userProfile.update({ where: { id: target.id }, data: { email } });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'account.email.admin_change',
    entity: 'UserProfile',
    entityId: target.id,
    before: { email: target.email },
    after: { email },
  });
  return { email };
}
