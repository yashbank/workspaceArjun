/**
 * The logic behind D12's business rules — "changing a rule must never change the past".
 *
 * D12's rules, each a function here so it is tested rather than read off a picture:
 *
 * - **A change is a NEW ROW with a start date; the old row keeps its range.** Nothing is edited or deleted. A wrong
 *   value is corrected by adding another row, so the mistake and the correction are both on the record.
 *   (`buildRulesLedger` reads rows; `validateSchedule` guards the only write.)
 * - **Read as of a date.** The value "in force" is the row with the latest start on or before that day
 *   (`resolveAsOf`, the same resolver payroll uses — F-08, D27).
 * - **The scheduled row is visible before it lands** and the header counts it — a value that silently appears on
 *   the first of the month reads as a system fault.
 * - **A reason is required.** A threshold that moved with no explanation is the first thing an auditor asks about.
 * - **A seeded row says it was seeded**, not that an Owner chose it (`updatedById` null → `seeded`).
 * - **Days are the factory's** (D22): "today" is passed in, computed in the factory zone; a change may not start in
 *   the past.
 *
 * Pure: no Prisma, no React.
 */

import { dbDateKey } from './attendance-month';
import { resolveAsOf } from './effective-dated';

export type RuleRowInput = {
  id: string;
  ruleKey: string;
  ruleValue: string;
  valueType: string;
  label: string;
  description: string | null;
  effectiveFrom: Date;
  updatedById: string | null;
  updatedAt: Date;
};

export type HistoryStatus = 'scheduled' | 'inforce' | 'superseded';

export type HistoryRow = {
  id: string;
  value: string;
  /** `YYYY-MM-DD` — the day it starts. */
  from: string;
  /** The last day it applies (the day before the next row starts); null for the newest row. */
  until: string | null;
  status: HistoryStatus;
  /** Who chose it — null for a seeded row (`seeded` is then true), never a guess. */
  by: string | null;
  seeded: boolean;
  reason: string | null;
};

export type RuleView = {
  ruleKey: string;
  label: string;
  description: string | null;
  valueType: string;
  /** The value in force on the "as of" day, or null when none had started yet. */
  value: string | null;
  from: string | null;
  /** The next row that has NOT started yet, if any. */
  scheduled: { value: string; from: string } | null;
  history: HistoryRow[];
};

export type RulesLedger = {
  asOf: string;
  todayKey: string;
  rules: RuleView[];
  scheduledCount: number;
};

const byDay = (a: RuleRowInput, b: RuleRowInput) => dbDateKey(a.effectiveFrom).localeCompare(dbDateKey(b.effectiveFrom));

const dayBefore = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export function buildRulesLedger(
  rows: readonly RuleRowInput[],
  input: { asOf: string; todayKey: string; names: ReadonlyMap<string, string>; reasons: ReadonlyMap<string, string> },
): RulesLedger {
  const groups = new Map<string, RuleRowInput[]>();
  for (const r of rows) groups.set(r.ruleKey, [...(groups.get(r.ruleKey) ?? []), r]);

  const asOfDate = new Date(`${input.asOf}T00:00:00Z`);
  const todayDate = new Date(`${input.todayKey}T00:00:00Z`);

  const rules: RuleView[] = [...groups.entries()]
    .map(([ruleKey, group]) => {
      const sorted = [...group].sort(byDay);
      const newest = sorted[sorted.length - 1];
      const inForceNow = resolveAsOf(sorted, todayDate);
      const shown = resolveAsOf(sorted, asOfDate);
      const upcoming = sorted.find((r) => dbDateKey(r.effectiveFrom) > input.todayKey) ?? null;

      const history: HistoryRow[] = sorted
        .map((r, i): HistoryRow => {
          const from = dbDateKey(r.effectiveFrom);
          const next = sorted[i + 1];
          return {
            id: r.id,
            value: r.ruleValue,
            from,
            until: next ? dayBefore(dbDateKey(next.effectiveFrom)) : null,
            status: from > input.todayKey ? 'scheduled' : r.id === inForceNow?.id ? 'inforce' : 'superseded',
            by: r.updatedById ? input.names.get(r.updatedById) ?? null : null,
            seeded: r.updatedById === null,
            reason: input.reasons.get(r.id) ?? null,
          };
        })
        .reverse(); // newest first, as the artboard lists it

      return {
        ruleKey,
        label: newest.label,
        description: newest.description,
        valueType: newest.valueType,
        value: shown?.ruleValue ?? null,
        from: shown ? dbDateKey(shown.effectiveFrom) : null,
        scheduled: upcoming ? { value: upcoming.ruleValue, from: dbDateKey(upcoming.effectiveFrom) } : null,
        history,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.ruleKey.localeCompare(b.ruleKey));

  return { asOf: input.asOf, todayKey: input.todayKey, rules, scheduledCount: rules.reduce((s, r) => s + r.history.filter((h) => h.status === 'scheduled').length, 0) };
}

const DAY = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** A real calendar day (2026-02-30 is not). */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export const MIN_REASON = 3;
export const MAX_REASON = 500;
export const MAX_VALUE = 200;

/** Rules whose value is a whole count, and the least each may be — the readers ignore anything else and fall back. */
const WHOLE_MIN: Record<string, number> = {
  AQL_SAMPLE_SIZE: 1,
  AQL_CRITICAL_MAX: 0,
  AQL_MAJOR_MAX: 0,
  AQL_MINOR_MAX: 0,
  ATTENDANCE_CORRECTION_DAYS: 1,
  'line_clearance.max_minutes': 1,
  'offline.clock_skew_minutes': 1,
  'offline.max_queue_age_hours': 1,
};
/** Rules whose value is one of a fixed set. */
const ONE_OF: Record<string, readonly string[]> = { 'line_clearance.mode': ['JOB', 'SHIFT', 'MINUTES'] };

/**
 * The message a value earns, or null. A value the reader would silently ignore must not be shown as "in force":
 * `getCorrectionWindowDays` falls back to 3 for 0, `getLineClearanceRule` to JOB for "shift". So the screen refuses
 * what the reader would refuse. Numbers are plain decimals (`Number()` also accepts `0x10` and `1e3`, which nobody meant).
 */
export function validateRuleValue(ruleKey: string, valueType: string, value: string): string | null {
  const v = value.trim();
  if (v === '') return 'A new value is required.';
  if (v.length > MAX_VALUE) return `A value is at most ${MAX_VALUE} characters.`;
  const allowed = ONE_OF[ruleKey];
  if (allowed && !allowed.includes(v)) return `This rule must be one of: ${allowed.join(', ')}.`;
  const whole = WHOLE_MIN[ruleKey];
  if (whole !== undefined) {
    if (!/^\d+$/.test(v) || Number(v) < whole) return whole === 0 ? 'This rule is a whole number, zero or more.' : `This rule is a whole number, ${whole} or more.`;
    return null;
  }
  if (valueType === 'number' && !/^\d+(\.\d+)?$/.test(v)) return 'This rule is a number, zero or more.';
  return null;
}

/** The one message a refused change shows, or null. Checked in this order: reason, value, day. */
export function validateSchedule(input: {
  ruleKey: string;
  value: string;
  valueType: string;
  effectiveFrom: string;
  reason: string;
  todayKey: string;
  existingDays: readonly string[];
}): string | null {
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) return 'A reason is required: a threshold that moved with nothing attached is the first thing an auditor asks about.';
  if (reason.length > MAX_REASON) return `A reason is at most ${MAX_REASON} characters.`;
  const invalid = validateRuleValue(input.ruleKey, input.valueType, input.value);
  if (invalid) return invalid;
  if (!isDayKey(input.effectiveFrom)) return 'The start day must be a real date.';
  if (input.effectiveFrom < input.todayKey) return 'A change cannot start in the past: nothing already printed or already judged is rewritten.';
  if (input.existingDays.includes(input.effectiveFrom)) return 'A row for this rule already starts on that day. Nothing is edited — pick another day.';
  return null;
}

/** A day as the artboard writes it: 01/10/2026. */
export function dmy(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

export type RulesLedgerView = RulesLedger & {
  /** The rule whose history and change form are open, or null. */
  selectedKey: string | null;
  /** Wage and AQL keys are the ones payroll pays and QC accepts; the screen says so (a flag, not a figure). */
  sensitiveKeys: string[];
};
