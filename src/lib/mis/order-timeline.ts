/**
 * The rules behind D4's order detail, as pure functions.
 *
 * D4 makes three claims a screenshot cannot enforce, and each is a function here so it can
 * be tested as logic rather than read off a picture:
 *
 * 1. **Phase state has three values, not two** — signed, running, not started — and "not
 *    started" splits into *blocked by phase N* and *merely not yet*. "The gate is D7 and the
 *    screen has to make it visible or it looks like a bug." (`phaseStates`)
 * 2. **Every figure is planned against actual** — never a single number, and never a
 *    percentage on its own. (`phaseFigures` returns the pair, and the pair's denominator is
 *    only ever something recorded: D13.)
 * 3. **Eight squares beat a table** — the hourly QC strip shows what was taken, what failed
 *    and what is still to come in one glance. (`hourlyQcStrip`)
 *
 * Time is the factory's, never the server's (D22): every hour and every "days left" here is
 * computed against the factory timezone that is passed in. Nothing in this file reads a
 * server-local clock, and nothing has a default that reads the environment.
 *
 * Pure: no Prisma, no React.
 */

import { addDaysToDateKey, factoryDateKey, factoryMinuteOfDay } from './factory-time';

// ---------------------------------------------------------------------------
// 1. Phase state
// ---------------------------------------------------------------------------

export type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'SIGNED_OFF' | 'NOT_APPLICABLE' | 'REOPENED';

export type PhaseInput = { id: string; sequence: number; status: PhaseStatus };

export type PhaseState =
  | { kind: 'SIGNED' }
  | { kind: 'RUNNING' }
  | { kind: 'REOPENED' }
  /** Waiting on the phase directly before it, which is running or has been reopened. */
  | { kind: 'BLOCKED'; bySequence: number }
  /** Not started, and nothing running ahead of it is holding it. */
  | { kind: 'NOT_YET' }
  | { kind: 'NOT_APPLICABLE' };

/**
 * The state of every phase on an order, keyed by phase id.
 *
 * "Blocked by" is deliberately narrow: only the phase DIRECTLY after a running or reopened
 * one. In the artboard, Lamination (3) is "Blocked by phase 2" while Die cutting (4) is plain
 * "Not started" — phase 4's predecessor is itself unstarted, so nothing is holding it that
 * the person could act on. Marking every later phase "blocked" would put a red-ish chip on
 * five rows and teach people to ignore the one that matters.
 *
 * "Directly before" skips `NOT_APPLICABLE` phases, the same rule the sign-off gate applies
 * when it looks for the previous phase (Appendix A).
 */
export function phaseStates(phases: readonly PhaseInput[]): Map<string, PhaseState> {
  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  const states = new Map<string, PhaseState>();

  let previous: PhaseInput | null = null;
  for (const phase of ordered) {
    if (phase.status === 'NOT_APPLICABLE') {
      states.set(phase.id, { kind: 'NOT_APPLICABLE' });
      continue; // does not become anyone's predecessor
    }

    if (phase.status === 'SIGNED_OFF') states.set(phase.id, { kind: 'SIGNED' });
    else if (phase.status === 'IN_PROGRESS') states.set(phase.id, { kind: 'RUNNING' });
    else if (phase.status === 'REOPENED') states.set(phase.id, { kind: 'REOPENED' });
    else if (previous && (previous.status === 'IN_PROGRESS' || previous.status === 'REOPENED')) {
      states.set(phase.id, { kind: 'BLOCKED', bySequence: previous.sequence });
    } else {
      states.set(phase.id, { kind: 'NOT_YET' });
    }

    previous = phase;
  }

  return states;
}

/** The phase to act on next: the running one, else a reopened one, else null. */
export function activePhase<T extends PhaseInput>(phases: readonly T[]): T | null {
  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  return (
    ordered.find((p) => p.status === 'IN_PROGRESS') ?? ordered.find((p) => p.status === 'REOPENED') ?? null
  );
}

/**
 * "Phase 2 of 7" — the position of the active phase among the phases that APPLY, and how many
 * apply. A phase marked not applicable is not counted, so the order is never "phase 3 of 7"
 * when only six phases will ever run.
 */
export function phasePosition(phases: readonly PhaseInput[], activeId: string | null): { at: number; of: number } | null {
  const applicable = [...phases].filter((p) => p.status !== 'NOT_APPLICABLE').sort((a, b) => a.sequence - b.sequence);
  if (applicable.length === 0) return null;
  const index = activeId ? applicable.findIndex((p) => p.id === activeId) : -1;
  return { at: index >= 0 ? index + 1 : 0, of: applicable.length };
}

/** Signed phases against phases that apply — the bar under the title, "not a guessed percentage". */
export function phaseProgress(phases: readonly PhaseInput[]): { done: number; total: number } {
  const applicable = phases.filter((p) => p.status !== 'NOT_APPLICABLE');
  return { done: applicable.filter((p) => p.status === 'SIGNED_OFF').length, total: applicable.length };
}

// ---------------------------------------------------------------------------
// 2. Figures
// ---------------------------------------------------------------------------

export type ProductionLogLike = { jobPhaseId: string | null; qtyProduced: unknown; qtyWaste: unknown };

/**
 * Produced and wasted for one phase, from the order's production logs.
 *
 * Numbers are converted here, at the boundary — a Prisma `Decimal` must never reach a client
 * component. A phase with no logs returns `entries: 0`, which the screen renders as "nothing
 * recorded yet", never as a zero (D2).
 */
export function phaseFigures(logs: readonly ProductionLogLike[], phaseId: string) {
  const mine = logs.filter((l) => l.jobPhaseId === phaseId);
  return {
    entries: mine.length,
    produced: mine.reduce((sum, l) => sum + Number(l.qtyProduced ?? 0), 0),
    waste: mine.reduce((sum, l) => sum + Number(l.qtyWaste ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// 3. The hourly QC strip
// ---------------------------------------------------------------------------

export type QcCheckLike = {
  checkTime: Date;
  result: string;
  parameterName?: string | null;
  defectType?: string | null;
  acknowledgedAt?: Date | null;
};

/**
 * PASS and FAIL are recorded outcomes. MISSED is an hour that has ended with nothing taken —
 * MIS_UI_SPEC §4.4 rule 6: "dashed = never recorded", distinct from grey = recorded state.
 * UPCOMING is an hour still to come, so the strip reads "six taken, one failed, two to come".
 */
export type QcSlotState = 'PASS' | 'FAIL' | 'MISSED' | 'UPCOMING';

export type QcSlot = { hour: number; state: QcSlotState };

/**
 * One slot per whole hour of the shift, for the factory day `dateKey`.
 *
 * A check counts toward the hour it was taken in, in the factory's timezone. A slot with any
 * FAIL is FAIL even if another check that hour passed — a failure must not be averaged away.
 * Checks from other days are ignored: this strip is "today".
 *
 * `startMinute` and `endMinute` are minutes-of-day (an overnight shift has `endMinute` <
 * `startMinute`, and its later hours are numbered past 24 so the strip stays in order).
 */
export function hourlyQcStrip(
  checks: readonly QcCheckLike[],
  shift: { startMinute: number; endMinute: number },
  now: Date,
  dateKey: string,
  timeZone: string,
): QcSlot[] {
  const startHour = Math.floor(shift.startMinute / 60);
  const endMinute = shift.endMinute <= shift.startMinute ? shift.endMinute + 1440 : shift.endMinute;
  const slotCount = Math.max(0, Math.ceil((endMinute - startHour * 60) / 60));

  const nowKey = factoryDateKey(now, timeZone);
  const nowMinute = factoryMinuteOfDay(now, timeZone);
  // Minutes elapsed on the shift's own axis: a "day" is the shift's start day.
  const nowOnAxis =
    nowKey === dateKey ? nowMinute : nowKey === addDaysToDateKey(dateKey, 1) ? nowMinute + 1440 : nowKey < dateKey ? -1 : Number.POSITIVE_INFINITY;

  const outcome = new Map<number, 'PASS' | 'FAIL'>();
  for (const check of checks) {
    const key = factoryDateKey(check.checkTime, timeZone);
    const minute = factoryMinuteOfDay(check.checkTime, timeZone);
    const axis = key === dateKey ? minute : key === addDaysToDateKey(dateKey, 1) ? minute + 1440 : null;
    if (axis === null) continue;
    const slot = Math.floor(axis / 60) - startHour;
    if (slot < 0 || slot >= slotCount) continue;
    const kind = check.result === 'FAIL' ? 'FAIL' : 'PASS';
    if (outcome.get(slot) !== 'FAIL') outcome.set(slot, kind);
  }

  return Array.from({ length: slotCount }, (_, slot) => {
    const hour = startHour + slot;
    const recorded = outcome.get(slot);
    if (recorded) return { hour, state: recorded };
    const slotEnd = (hour + 1) * 60;
    return { hour, state: nowOnAxis >= slotEnd ? 'MISSED' : 'UPCOMING' };
  });
}

/** Passed of taken, and the open defect if there is one — "Passed 5 of 6 taken · Shade · major". */
export function qcSummary(checks: readonly QcCheckLike[]) {
  const taken = checks.length;
  const passed = checks.filter((c) => c.result !== 'FAIL').length;
  const open = checks
    .filter((c) => c.result === 'FAIL' && !c.acknowledgedAt)
    .sort((a, b) => b.checkTime.getTime() - a.checkTime.getTime())[0];
  return {
    taken,
    passed,
    openDefect: open ? { parameter: open.parameterName ?? null, defectType: open.defectType ?? null, at: open.checkTime } : null,
  };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * Whole factory-days from today to delivery. Negative is overdue. Both sides are reduced to a
 * factory date first, so a delivery due "tomorrow" is 1 whatever hour the server is asked at
 * (D22 — the database's UTC+8 must not make an evening order overdue a day early).
 */
export function daysUntil(delivery: Date | null, now: Date, timeZone: string): number | null {
  if (!delivery) return null;
  const toDay = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000;
  return Math.round(toDay(factoryDateKey(delivery, timeZone)) - toDay(factoryDateKey(now, timeZone)));
}
