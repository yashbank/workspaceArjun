/**
 * Does a production log agree with the machine board? (R3 B99, warn only: nothing is blocked.)
 *
 * A log is `OK` when a live (unreleased) booking on that machine covers the moment of the log and
 * is for the same order; `OTHER_ORDER` when the machine is booked then, but for a different order;
 * `NO_BOOKING` when no live booking covers it. A released booking counts as no booking.
 *
 * Pure: no Prisma, no React.
 */
export type SyncFlag = 'OK' | 'NO_BOOKING' | 'OTHER_ORDER';

export type BookingWindow = {
  machineId: string;
  orderId: string | null;
  startsAt: Date;
  endsAt: Date;
  releasedAt: Date | null;
};

export function classifyLogAgainstBookings(
  log: { machineId: string; orderId: string; at: Date },
  bookings: BookingWindow[],
): SyncFlag {
  const t = log.at.getTime();
  const covering = bookings.filter(
    (b) => b.machineId === log.machineId && !b.releasedAt && b.startsAt.getTime() <= t && t <= b.endsAt.getTime(),
  );
  if (covering.length === 0) return 'NO_BOOKING';
  return covering.some((b) => b.orderId === log.orderId) ? 'OK' : 'OTHER_ORDER';
}

const SEVERITY: Record<SyncFlag, number> = { OK: 0, OTHER_ORDER: 1, NO_BOOKING: 2 };

/** The worst of several flags (NO_BOOKING > OTHER_ORDER > OK); null for none. */
export function worstFlag(flags: SyncFlag[]): SyncFlag | null {
  let worst: SyncFlag | null = null;
  for (const f of flags) if (worst === null || SEVERITY[f] > SEVERITY[worst]) worst = f;
  return worst;
}
