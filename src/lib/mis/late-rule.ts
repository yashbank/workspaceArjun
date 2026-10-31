/**
 * R2-230 — the lateness rule, in one place. Pure: no Prisma, no clock.
 *
 * Two settings drive it:
 *  - `attendance.late_threshold_minutes` — the grace. Arriving within it is on time (0 late minutes);
 *    arriving after it is late, counted from the SHIFT START (not from the end of the grace).
 *  - `attendance.late_rule_workers` — who the rule applies to: `ALL` (default), `DAILY` or `MONTHLY`
 *    (the employee's pay type). Anyone outside that group is never marked late.
 *
 * Unset (or unreadable) settings keep the old behaviour: no grace, everyone.
 */

export type LateWorkers = 'ALL' | 'DAILY' | 'MONTHLY';
export type LateRule = { graceMinutes: number; workers: LateWorkers };
export type PayTypeLike = 'DAILY' | 'MONTHLY';

export const DEFAULT_LATE_RULE: LateRule = { graceMinutes: 0, workers: 'ALL' };
/** R2-242 / R2-260: the only values the workers setting accepts — Settings offers exactly these and refuses anything else. */
export const LATE_WORKERS_OPTIONS: readonly LateWorkers[] = ['ALL', 'DAILY', 'MONTHLY'];
export function isLateWorkers(value: string): value is LateWorkers {
  return (LATE_WORKERS_OPTIONS as readonly string[]).includes(value);
}
const MAX_GRACE_MINUTES = 240;

export function parseLateRule(thresholdRaw: string | null | undefined, workersRaw: string | null | undefined): LateRule {
  const grace = Number.parseInt((thresholdRaw ?? '').trim(), 10);
  const word = (workersRaw ?? '').trim().toUpperCase();
  return {
    graceMinutes: Number.isFinite(grace) && grace > 0 ? Math.min(grace, MAX_GRACE_MINUTES) : 0,
    workers: word.startsWith('DAILY') ? 'DAILY' : word.startsWith('MONTHLY') ? 'MONTHLY' : 'ALL',
  };
}

/** The grace this person gets, or `null` when the rule does not apply to them (they are never late). */
export function lateGraceFor(rule: LateRule, payType: PayTypeLike | null | undefined): number | null {
  if (rule.workers !== 'ALL' && rule.workers !== payType) return null;
  return rule.graceMinutes;
}

/** Raw minutes after shift start -> the late minutes to store. `null` grace = exempt. */
export function applyLateGrace(rawLateMinutes: number, grace: number | null): number {
  if (grace === null) return 0;
  return rawLateMinutes > grace ? rawLateMinutes : 0;
}

export const LATE_RULE_KEYS = ['attendance.late_threshold_minutes', 'attendance.late_rule_workers'] as const;

/**
 * The grace for one person from the saved settings. `read` is the server's rule reader, passed in so this file
 * stays free of server imports; a read that fails counts as "unset" (lateness must never block a punch).
 */
export async function resolveLateGrace(read: (key: string) => Promise<string | null>, payType: PayTypeLike | null | undefined): Promise<number | null> {
  try {
    const [threshold, workers] = await Promise.all(LATE_RULE_KEYS.map((key) => read(key)));
    return lateGraceFor(parseLateRule(threshold, workers), payType);
  } catch {
    return lateGraceFor(DEFAULT_LATE_RULE, payType);
  }
}
