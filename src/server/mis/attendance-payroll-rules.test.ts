/**
 * Phase 19 · MIS-247 — "every rule in BRD §9.1 as a named test."
 *
 * The rules that actually exist in code are already snapshotted, one behaviour per named
 * test, spread across three files — this does not duplicate them, it names them:
 *   - Daily wage rate, OT multiplier, late-penalty rate: `rule-history.test.ts` (F-08 section) —
 *     one named `it()` per rate, per change (today, mid-month, back-dated, before any rule exists).
 *   - OT is a per-hour rate on the wage code (D26), replacing the multiplier when set:
 *     `payroll-25.test.ts` "25.2/D26 — OT rate per hour on the wage code".
 *   - Sunday handling, both pay types (D28/25.3): `payroll-25.test.ts` "25.3/D28 — pay type and
 *     Sunday pay" — a MONTHLY employee is paid every Sunday (even unrowed); a DAILY employee is
 *     paid a Sunday only when actually present, same as any other day.
 *   - Extra-pay days and their overlap with OT (D28): `payroll-25.test.ts` "25.4/25.5".
 * What was NOT separately named before this file: ABSENT and HALF_DAY were proven correct only
 * inside one combined test (`payroll-figures.test.ts`) alongside PRESENT and LEAVE. MIS-247's own
 * acceptance check asks for "one named test per rule... absence, half-day" — these two below are
 * that, snapshotting the same figures the combined test already pins, so a later change to either
 * rule's arithmetic breaks a test that names the rule, not a test about "a mix of every status".
 *
 * D20 (Phase 13): a lateness THRESHOLD, a grace period and a named overtime RULE (as opposed to
 * `OT_MULTIPLIER`, a rate input) do not exist in this codebase — there is nothing to snapshot for
 * "lateness threshold" or "grace period" as BRD §9.1 titles them, and inventing one here would be
 * policy, not QA. Logged, not re-logged: `qa/FINDINGS.md` already carries this (Phase 13 stamp on
 * this phase's own guide section).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DAILY_WAGE, EMP, fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll } = await import('./payroll');

const rec = (id: string, date: string, status: string, lateMinutes: number | null, otMinutes: number | null) => ({
  id, date: new Date(date), status, lateMinutes, otMinutes, employee: EMP, shift: { name: 'Day' },
});

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('MIS-247 — ABSENT earns nothing, named on its own', () => {
  it('a day marked ABSENT contributes zero basic pay, present count 0, absent count 1', async () => {
    state.attendance = [rec('1', '2026-01-05', 'ABSENT', 0, 0)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.basicWage).toBe(0);
    expect(row.present).toBe(0);
    expect(row.absent).toBe(1);
  });

  it('OT minutes recorded on an otherwise-ABSENT day are still paid (attendance and OT are independent facts)', async () => {
    state.attendance = [rec('1', '2026-01-05', 'ABSENT', 0, 60)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.basicWage).toBe(0);
    expect(row.otPay).toBeGreaterThan(0);
  });
});

describe('MIS-247 — HALF_DAY earns half the day rate, named on its own', () => {
  it('a day marked HALF_DAY pays exactly half the day rate in force that day', async () => {
    state.attendance = [rec('1', '2026-01-05', 'HALF_DAY', 0, 0)];
    const [row] = await calculateMonthlyPayroll(2026, 1);
    expect(row.basicWage).toBe(Math.round(0.5 * DAILY_WAGE));
    expect(row.halfDay).toBe(1);
    expect(row.present).toBe(1); // "present" counts a half day as a day the person showed up
  });
});

describe('MIS-234 — a night shift prices exactly like any other day', () => {
  // `attendance-punch.test.ts` already proves a night shift (22:05 → 06:20 next morning) files
  // as ONE row under the evening it started. This proves the OTHER half of "end to end": payroll
  // never looks at which shift a row belongs to, only its date/status/minutes, so that filed row
  // prices identically to a same-shaped day-shift row — the night shift's own date-filing quirk
  // cannot silently confuse which month, or which day's rate, it is priced under.
  it('an attendance row filed under a night shift and one filed under a day shift, same status and minutes, price identically', async () => {
    const nightRow = { id: '1', date: new Date('2026-01-05'), status: 'PRESENT', lateMinutes: 15, otMinutes: 90, employee: EMP, shift: { name: 'Night' } };
    const dayRow = { id: '1', date: new Date('2026-01-05'), status: 'PRESENT', lateMinutes: 15, otMinutes: 90, employee: EMP, shift: { name: 'Day' } };

    state.attendance = [nightRow];
    const [nightPriced] = await calculateMonthlyPayroll(2026, 1);

    seedWorld();
    state.attendance = [dayRow];
    const [dayPriced] = await calculateMonthlyPayroll(2026, 1);

    expect(nightPriced.basicWage).toBe(dayPriced.basicWage);
    expect(nightPriced.otPay).toBe(dayPriced.otPay);
    expect(nightPriced.latePenalty).toBe(dayPriced.latePenalty);
    expect(nightPriced.grossPay).toBe(dayPriced.grossPay);
  });
});
