import { formatDistanceStrict } from 'date-fns';

/**
 * "2 days", "4 hrs", "20 min" — the age pill on an approval row (R1, D1).
 *
 * Pure (no Prisma, no React) so the phone card and the desktop widget draw the exact same
 * word for the exact same gap. Hours and minutes are abbreviated because a pill has no room
 * for "4 hours ago"; days, weeks and months keep their date-fns word.
 *
 * `formatDistanceToNowStrict` cannot be pinned to a caller-supplied "now" (date-fns 4 always
 * measures against the real clock), so this calls `formatDistanceStrict` against an explicit
 * `now` instead — the only way this is unit-testable without a fake system clock.
 */
export function shortAge(at: Date, now: Date = new Date()): string {
  return formatDistanceStrict(at, now)
    .replace(/^(\d+) hours?$/, '$1 hrs')
    .replace(/^(\d+) minutes?$/, '$1 min');
}
