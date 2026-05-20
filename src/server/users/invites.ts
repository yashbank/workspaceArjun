import { db } from '@/server/db';

/** Pending invites older than this are auto-cancelled to free seats. */
export const STALE_INVITE_DAYS = 14;

export async function releaseStalePendingInvite(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_INVITE_DAYS);

  const stale = await db.userInvite.findFirst({
    where: {
      email: normalized,
      status: 'pending',
      invitedAt: { lt: cutoff },
    },
  });

  if (!stale) return false;

  await db.userInvite.update({
    where: { id: stale.id },
    data: { status: 'cancelled' },
  });

  return true;
}

export async function cancelPendingInvitesForEmail(email: string): Promise<number> {
  const normalized = email.trim().toLowerCase();
  const result = await db.userInvite.updateMany({
    where: { email: normalized, status: 'pending' },
    data: { status: 'cancelled' },
  });
  return result.count;
}
