import { db } from '@/server/db';
import { getMaxUsers } from '@/server/settings';

export type SeatUsage = {
  max: number;
  active: number;
  pendingInvites: number;
  used: number;
  available: number;
};

export async function getSeatUsage(): Promise<SeatUsage> {
  const max = await getMaxUsers();
  const [active, pendingInvites] = await Promise.all([
    db.userProfile.count({ where: { status: 'active' } }),
    db.userInvite.count({ where: { status: 'pending' } }),
  ]);
  const used = active + pendingInvites;
  return {
    max,
    active,
    pendingInvites,
    used,
    available: Math.max(0, max - used),
  };
}

export async function assertSeatAvailable(): Promise<SeatUsage> {
  const seats = await getSeatUsage();
  if (seats.used >= seats.max) {
    throw new Error(
      `Workspace user limit reached (${seats.max} seats). Deactivate a user or cancel a pending invite to free a seat.`,
    );
  }
  return seats;
}
