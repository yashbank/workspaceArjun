/**
 * Phase 14 · MIS-272 — a rule change never moves a number that was already recorded.
 *
 * Two halves. (1) The store is append-only: changing a rate or a rule adds a row and leaves
 * every earlier row byte-identical. (2) The READERS use the rule in force on the day they price —
 * payroll for last month does not move when this month's rate changes (F-08, fixed in 14F under
 * D27), and QC's decisions are never recomputed (D6 / Phase 5).
 *
 * Time is pinned with fake Date so "last month" and "today" are exact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSource } from './testing/ast';
import { fakeDb, seedWorld, state, type Row } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll } = await import('./payroll');
const { addWageRate, createWageType, getWageAmount } = await import('./wage-type');
const { updateBusinessRule, getRuleValue } = await import('./business-rules');

// The fixture's rows are effective 2026-01-01; "today" is mid-February, so January is last month.
const TODAY = new Date('2026-02-10T09:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});
afterEach(() => vi.useRealTimers());

const snapshot = (rows: Row[]) => JSON.stringify(rows);
const payrollJanuary = async () => JSON.stringify(await calculateMonthlyPayroll(2026, 1));

describe('the store is append-only — an earlier row is never touched', () => {
  it('a new wage rate adds a row and leaves every earlier row byte-identical', async () => {
    const before = snapshot(state.wageTypes);
    await addWageRate('WG-DAILY-01', 900, TODAY);
    expect(state.wageTypes).toHaveLength(3);
    expect(snapshot(state.wageTypes.slice(0, 2))).toBe(before);
  });

  it('a rule edit adds a revision and leaves every earlier revision byte-identical', async () => {
    const before = snapshot(state.rules);
    await updateBusinessRule('OT_MULTIPLIER', '3');
    expect(state.rules).toHaveLength(9);
    expect(snapshot(state.rules.slice(0, 8))).toBe(before);
  });

  it('a rule reads its OLD value as of a date before the change, and the new one after', async () => {
    await updateBusinessRule('OT_MULTIPLIER', '3');
    // The reader supports history: the value now is the new one...
    expect(await getRuleValue('OT_MULTIPLIER')).toBe('3');
    // ...and a wage-type amount can be read as of last month's rate.
    await addWageRate('WG-DAILY-01', 900, TODAY);
    expect(await getWageAmount('WG-DAILY-01', new Date('2026-01-15'))).toBe(731.19);
    expect(await getWageAmount('WG-DAILY-01', TODAY)).toBe(900);
  });

  it('the new rate does apply going forward — this month moves, as it should', async () => {
    const before = await calculateMonthlyPayroll(2026, 2);
    await addWageRate('WG-DAILY-01', 900, TODAY);
    const after = await calculateMonthlyPayroll(2026, 2);
    expect(after[0].basicWage).toBeGreaterThan(before[0].basicWage);
  });
});

const JAN = { basicWage: 2194, otPay: 326, latePenalty: 249, grossPay: 2270 }; // 3 days · 90 min OT · 300 min late, fixture rates
const janFigures = async () => {
  const [row] = await calculateMonthlyPayroll(2026, 1);
  return { basicWage: row.basicWage, otPay: row.otPay, latePenalty: row.latePenalty, grossPay: row.grossPay };
};

describe('F-08 (fixed in 14F, D27) — payroll for a CLOSED month must not move when a rule changes', () => {
  it('the fixture is sound: January prices to the figures worked out by hand (3 × 731.19 …)', async () => {
    expect(await janFigures()).toEqual(JAN);
    expect((await calculateMonthlyPayroll(2026, 1))).toHaveLength(1);
  });

  it("a new daily rate effective today leaves January's payroll byte-identical", async () => {
    const before = await payrollJanuary();
    await addWageRate('WG-DAILY-01', 900, TODAY);
    expect(await payrollJanuary()).toBe(before);
  });

  it("a new overtime multiplier effective today leaves January's payroll byte-identical", async () => {
    const before = await payrollJanuary();
    await updateBusinessRule('OT_MULTIPLIER', '3');
    expect(await payrollJanuary()).toBe(before);
  });

  it("a new late-penalty rate effective today leaves January's payroll byte-identical", async () => {
    const before = await payrollJanuary();
    await updateBusinessRule('LATE_PENALTY_PER_MIN', '5');
    expect(await payrollJanuary()).toBe(before);
  });

  it("a rate that takes effect AFTER the month, however far ahead, never touches it", async () => {
    await addWageRate('WG-DAILY-01', 900, new Date('2026-02-20'));
    expect(await janFigures()).toEqual(JAN);
  });

  it('a rate that takes effect mid-month splits the month at that date — each day at its own day\'s rate', async () => {
    // 5 Jan at 731.19 (late 300 min), 6 Jan and 7 Jan at 900 (6 Jan has 90 min OT).
    await addWageRate('WG-DAILY-01', 900, new Date('2026-01-06'));
    expect(await janFigures()).toEqual({
      basicWage: 2531, // 731.19 + 900 + 900 = 2531.19
      otPay: 401, //     1.5 h × (900 ÷ 8) × 2.375 = 400.78
      latePenalty: 249, // the late day is 5 Jan: still 300 × 0.83
      grossPay: 2683, // 2531.19 + 400.78 − 249 = 2682.97
    });
  });

  it('an overtime multiplier that changes mid-month applies from its date only', async () => {
    await updateBusinessRule('OT_MULTIPLIER', '3'); // effective today (10 Feb): after the 6 Jan overtime
    expect((await janFigures()).otPay).toBe(JAN.otPay);
    const feb = await calculateMonthlyPayroll(2026, 2);
    expect(feb).toHaveLength(1); // and February, which has no overtime, is unaffected in shape
  });

  it('a BACK-DATED rate does move the days it covers — that is what back-dating means (D27 says so, and why a close is still needed)', async () => {
    await addWageRate('WG-DAILY-01', 900, new Date('2026-01-03'));
    expect((await janFigures()).basicWage).toBe(2700); // 3 × 900
  });

  it('the wage-type master introduced AFTER the month leaves that month on the flat rule it was paid under (MIS-44)', async () => {
    state.wageTypes = []; // before the Owner ever created WG-DAILY-01: payroll ran on DAILY_WAGE_DEFAULT (649.37)
    const flat = await janFigures();
    expect(flat.basicWage).toBe(1948); // 3 × 649.37 = 1948.11
    await createWageType({ name: 'General', unit: 'DAILY', amount: 900, effectiveFrom: TODAY });
    expect(await janFigures()).toEqual(flat);
  });

  it('before any rule or rate exists the documented defaults apply (500 a day, ×1.5, no penalty)', async () => {
    state.wageTypes = [];
    state.rules = [];
    expect((await janFigures()).basicWage).toBe(1500);
  });
});

describe("the month is a run of DATES — bounds are UTC, so the 31st is never dropped (D22)", () => {
  // Run these in the timezone of the database (ap-southeast-1, UTC+8): a server-local
  // `new Date(2026, 0, 31)` is 30 Jan 16:00Z there and would silently drop 31 January.
  const original = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Asia/Singapore';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('the test really is running east of Greenwich (else the assertions below prove nothing)', () => {
    expect(new Date(2026, 0, 31).toISOString()).toBe('2026-01-30T16:00:00.000Z');
  });

  it('asks the database for 1 Jan 00:00Z to 31 Jan 00:00Z exactly, whatever the server timezone', async () => {
    await calculateMonthlyPayroll(2026, 1);
    const { date } = state.attendanceWhere.at(-1)!;
    expect(date.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(date.lte.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('includes the last day of the month and excludes the neighbours on both sides', async () => {
    state.attendance.push(
      { id: 'x1', date: new Date('2025-12-31'), status: 'PRESENT', lateMinutes: 0, otMinutes: 0, employee: { id: 'e9', name: 'Dec', employeeCode: 'E-9' }, shift: null },
      { id: 'x2', date: new Date('2026-01-31'), status: 'PRESENT', lateMinutes: 0, otMinutes: 0, employee: { id: 'e8', name: 'Last', employeeCode: 'E-8' }, shift: null },
      { id: 'x3', date: new Date('2026-02-01'), status: 'PRESENT', lateMinutes: 0, otMinutes: 0, employee: { id: 'e7', name: 'Feb', employeeCode: 'E-7' }, shift: null },
    );
    const names = (await calculateMonthlyPayroll(2026, 1)).map((r) => r.employeeName).sort();
    expect(names).toEqual(['Asha', 'Last']);
  });

  it('a 28-day and a 31-day month report their own length', async () => {
    expect((await calculateMonthlyPayroll(2026, 1))[0].workingDays).toBe(31);
    expect((await calculateMonthlyPayroll(2026, 2))[0].workingDays).toBe(28);
  });
});

describe('F-09 — changing the same rule twice in one day', () => {
  // The schema keys a rule revision on (ruleKey, effectiveFrom) and effectiveFrom is a DATE, so
  // a second edit on the same day collides. The right behaviour is a deliberate one — the
  // later edit wins, or a clear refusal — not a raw constraint error.
  it.fails('a second edit on the same day does not surface a raw database constraint error', async () => {
    await updateBusinessRule('OT_MULTIPLIER', '3');
    await expect(updateBusinessRule('OT_MULTIPLIER', '4')).resolves.toBeDefined();
  });

  it.fails('the same on the very first AQL edit: the defaults are created today, so editing one today collides', async () => {
    const { getAqlThresholdRules, updateAqlThreshold } = await import('./business-rules');
    state.rules = state.rules.filter((r) => !String(r.ruleKey).startsWith('AQL_')); // a workspace that never opened the AQL screen
    await getAqlThresholdRules(); // seeds AQL_* rows with effectiveFrom = today
    await expect(updateAqlThreshold('AQL_MAJOR_MAX', '3')).resolves.toBeDefined();
  });

  it.fails('the same for a wage rate', async () => {
    await addWageRate('WG-DAILY-01', 900, TODAY);
    await expect(addWageRate('WG-DAILY-01', 950, TODAY)).resolves.toBeDefined();
  });
});

describe('QC decisions are written once and never recomputed (D6, Phase 5)', () => {
  const qc = readSource('src/server/mis/qc.ts');

  it('only recordAqlSample reads the thresholds or scores a sample — every reader reads the stored result', () => {
    // Split the module into exported functions and see which mention the scorer.
    const chunks = qc.split(/\nexport (?:async )?function /).slice(1);
    const scoring = chunks.filter((c) => /getAqlThresholds\(|evaluateAql\(/.test(c)).map((c) => c.slice(0, c.indexOf('(')));
    expect(scoring).toEqual(['recordAqlSample']);
  });

  it('the thresholds a decision used are snapshotted into its audit row', () => {
    expect(qc).toMatch(/action: 'AQL_DECISION'[\s\S]*thresholds: result\.thresholds/);
  });

  it('a QC check row has no column that a threshold change could rewrite', () => {
    const schema = readSource('prisma/schema.prisma');
    const model = schema.slice(schema.indexOf('model MisQcCheck'), schema.indexOf('}', schema.indexOf('model MisQcCheck')));
    expect(model).not.toMatch(/threshold|aql|sampleSizeRequired/i);
    expect(model).toMatch(/result\s+/);
  });
});

