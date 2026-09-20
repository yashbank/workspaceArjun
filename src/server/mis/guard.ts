import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/server/auth';

import { isMisEnabled } from './flags';

/**
 * Resolve the signed-in user and assert MIS access, or 404.
 *
 * 404 rather than 403 on purpose: a 403 confirms the route exists, which tells
 * an unflagged client we are building something here. "Not found" is the honest
 * answer for an account the module does not exist for.
 *
 * Returns the profile so callers need not resolve the session twice.
 */
export async function requireMisAccess() {
  const user = await getCurrentUser();
  if (!user || !isMisEnabled(user.id)) {
    notFound();
  }
  return user;
}
