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

// ---------------------------------------------------------------------------
// R2-40/41/45 — a production log keeps the machine board honest.
// ---------------------------------------------------------------------------

export type SyncBooking = BookingWindow & {
  id: string;
  /** SCHEDULED (booked on the board) or PRODUCTION_LOG (auto-created by an earlier log). Absent = SCHEDULED. */
  source?: 'SCHEDULED' | 'PRODUCTION_LOG' | null;
  orderNumber?: string | null;
};

/**
 * What saving a log at `at` on `machineId` for `orderId` does to the board:
 *
 *  - `COVERED`  — a live booking for this same order already covers it; nothing to add.
 *  - `CONFLICT` — another production log is already running a DIFFERENT order on this machine at
 *                 this time (its auto-created block covers `at`). The log is refused: one machine
 *                 cannot run two orders at once, and a second silent row would double-book it.
 *  - `SCHEDULED_OTHER` — the board has this machine booked for another order. Kept a warning
 *                 (R3 B123): the plan may simply have moved; the supervisor sees OTHER_ORDER.
 *  - `CREATE`   — nothing covers it: a PRODUCTION_LOG block is created so the board and the
 *                 utilisation report show the machine ran.
 */
export type SyncDecision =
  | { kind: 'COVERED'; booking: SyncBooking }
  | { kind: 'CONFLICT'; booking: SyncBooking }
  | { kind: 'SCHEDULED_OTHER'; booking: SyncBooking }
  /** R2-339: the same order's booking ended just before the log (press ran late): extend it to the log, no second block. */
  | { kind: 'EXTEND'; booking: SyncBooking }
  | { kind: 'CREATE' };

/** R2-339: a log this soon after a same-order booking ended extends that booking instead of opening a duplicate. */
export const LATE_ENTRY_GRACE_MS = 60 * 60 * 1000;

export function decideMachineSync(
  log: { machineId: string; orderId: string; at: Date },
  bookings: SyncBooking[],
): SyncDecision {
  const t = log.at.getTime();
  const covering = bookings.filter(
    (b) => b.machineId === log.machineId && !b.releasedAt && b.startsAt.getTime() <= t && t <= b.endsAt.getTime(),
  );
  const same = covering.find((b) => b.orderId === log.orderId);
  if (same) return { kind: 'COVERED', booking: same };
  const running = covering.find((b) => b.source === 'PRODUCTION_LOG');
  if (running) return { kind: 'CONFLICT', booking: running };
  if (covering.length > 0) return { kind: 'SCHEDULED_OTHER', booking: covering[0] };
  const justEnded = bookings
    .filter((b) => b.machineId === log.machineId && !b.releasedAt && b.orderId === log.orderId && b.endsAt.getTime() < t && t - b.endsAt.getTime() <= LATE_ENTRY_GRACE_MS)
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
  if (justEnded) return { kind: 'EXTEND', booking: justEnded };
  return { kind: 'CREATE' };
}

/** Without a shift to anchor it, an auto block spans this long, ending at the log. */
export const AUTO_BLOCK_FALLBACK_MS = 60 * 60 * 1000;

/**
 * The window of an auto-created block: the shift the log fell in when one is known (the run happened
 * during that shift), else the hour up to the log. Always contains `at`.
 */
export function autoBlockWindow(at: Date, shiftWindow: { start: Date; end: Date } | null): { startsAt: Date; endsAt: Date } {
  if (shiftWindow && shiftWindow.start.getTime() <= at.getTime() && at.getTime() <= shiftWindow.end.getTime()) {
    return { startsAt: shiftWindow.start, endsAt: shiftWindow.end };
  }
  return { startsAt: new Date(at.getTime() - AUTO_BLOCK_FALLBACK_MS), endsAt: at };
}
