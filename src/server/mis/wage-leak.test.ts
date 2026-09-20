/**
 * Phase 14 · MIS-46 — the money-leak sweep.
 *
 * The rule under test: WAGES ARE OWNER-ONLY, END TO END (`wages.read`, S9 — the BRD's own
 * label; it has no D-number, D6 is the AQL rule). A wage figure must not reach any other
 * role through a server function, a screen's props, or an audit payload. AQL thresholds
 * are Owner-only in the same way (D6, `aql.read`).
 *
 * How this test earns its keep — "would it go red if that broke?":
 *  1. Every probe runs as OWNER first and must SEE the sentinel money. If the fixture ever
 *     stops carrying it, the probe fails instead of passing on an empty result.
 *  2. The detector (`findLeaks`) is itself tested against known-leaky and known-clean
 *     samples below, so "no leaks found" cannot mean "the detector is blind".
 *  3. The sweep asserts the CORRECT property for every role. Where the code today breaks it,
 *     the case is wrapped in `it.fails` and numbered F-nn against docs/qa/FINDINGS.md:
 *     the suite stays green while the bug exists and goes RED the day it is fixed, which is
 *     the cue to delete the `.fails`. Nothing here was made to pass by weakening it.
 *
 * Sentinels are deliberately odd numbers (731.19) so an exact-value match cannot be a
 * coincidence with a count or an id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

import {
  BASE_SENTINELS,
  LONG_AGO as YESTERDAY,
  WAGE_DETECTOR,
  fakeDb,
  findLeaks,
  outcome,
  seedWorld,
  state,
  type Row,
} from './testing/wage-world';


vi.mock('@/server/db', () => ({ db: fakeDb }));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

// Record what the CALLER handed to the audit writer (pre-redact) and still run the real
// writer, so both the raw payload and the stored row can be inspected.
vi.mock('@/server/mis/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./audit')>();
  return {
    ...actual,
    logAuditEvent: (entry: Row) => {
      state.rawAudit.push(JSON.parse(JSON.stringify(entry)));
      return actual.logAuditEvent(entry as never);
    },
  };
});

const { listWageTypes, listWageCodes, createWageType, addWageRate, setWageTypeActive } = await import('./wage-type');
const { calculateMonthlyPayroll, getMonthWageBill } = await import('./payroll');
const { getBusinessRules, updateBusinessRule, getAqlThresholdRules, updateAqlThreshold } = await import('./business-rules');
const { getStoreReport } = await import('./reports');
const { getBom } = await import('./bom');
const { redact } = await import('./audit');

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

const NON_OWNER = MIS_ROLES.filter((r) => r !== 'OWNER');
const as = (role: MisRoleName) => getMisRole.mockResolvedValue(role);

/** Payroll's derived money, as the OWNER sees it — the ground truth for "what must not leak". */
async function ownerPayrollFigures(): Promise<string[]> {
  as('OWNER');
  const rows = await calculateMonthlyPayroll(2026, 1);
  return rows.flatMap((r) => [r.basicWage, r.otPay, r.latePenalty, r.grossPay]).map(String);
}

// ===========================================================================
// 0. The detector can fail
// ===========================================================================
describe('the leak detector is not blind', () => {
  const d = WAGE_DETECTOR(['2194']);

  it('flags a wage KEY, an exact sentinel VALUE, and a wage WORD', () => {
    expect(findLeaks({ basicWage: 1 }, d)).toEqual(['key basicWage']);
    expect(findLeaks({ rows: [{ x: '731.19' }] }, d)).toEqual(['value rows[0].x = 731.19']);
    expect(findLeaks({ label: 'Daily wage default' }, d)).toEqual(['word label = Daily wage default']);
    expect(findLeaks({ derived: 2194 }, d)).toEqual(['value derived = 2194']);
  });

  it('finds money nested three levels deep and inside arrays', () => {
    expect(findLeaks({ a: { b: [{ c: { grossPay: 5 } }] } }, d)).toEqual(['key a.b[0].c.grossPay']);
  });

  it('passes an honest, wage-free payload', () => {
    expect(findLeaks({ id: 'e1', name: 'Asha', present: 3, status: 'PRESENT', at: new Date() }, d)).toEqual([]);
  });

  it('the OWNER fixture really carries the money (a vacuous fixture would prove nothing)', async () => {
    as('OWNER');
    const figures = await ownerPayrollFigures();
    expect(figures.length).toBe(4);
    expect(figures.every((f) => f.length >= 3)).toBe(true);
    const bill = await getMonthWageBill(2026, 1);
    expect(findLeaks(bill, WAGE_DETECTOR(figures)).length).toBeGreaterThan(0);
    expect(findLeaks(await listWageTypes(), WAGE_DETECTOR()).length).toBeGreaterThan(0);
    expect(findLeaks(await getBusinessRules(), WAGE_DETECTOR()).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 1. Server functions — every non-Owner role, every wage-bearing function
// ===========================================================================
type Probe = {
  name: string;
  run: () => Promise<unknown>;
  /** false for a picker that is code + name only: it carries no money for anyone. */
  ownerSeesMoney?: false;
};

const READ_PROBES: Probe[] = [
  { name: 'listWageTypes', run: () => listWageTypes() },
  { name: 'listWageCodes', run: () => listWageCodes(), ownerSeesMoney: false },
  { name: 'getMonthWageBill', run: () => getMonthWageBill(2026, 1) },
  { name: 'calculateMonthlyPayroll', run: () => calculateMonthlyPayroll(2026, 1) }, // F-01, fixed in 14F
  { name: 'getBusinessRules (the settings list)', run: () => getBusinessRules() }, // F-02, fixed in 14F
];

describe('MIS-46 · wage figures by server function × role', () => {
  describe.each(READ_PROBES)('$name', (probe) => {
    it('OWNER is served (so a non-Owner "clean" result means something)', async () => {
      const figures = await ownerPayrollFigures();
      as('OWNER');
      const result = await probe.run();
      if (probe.ownerSeesMoney === false) {
        expect((result as unknown[]).length).toBeGreaterThan(0);
        expect(findLeaks(result, WAGE_DETECTOR(figures))).toEqual([]);
      } else {
        expect(findLeaks(result, WAGE_DETECTOR(figures)).length).toBeGreaterThan(0);
      }
    });

    it.each(NON_OWNER)('%s gets a refusal or a wage-free payload', async (role) => {
      const figures = await ownerPayrollFigures();
      as(role);
      const res = await outcome(probe.run);
      if (res === 'denied') return;
      // Let in: then the answer must be clean.
      expect(findLeaks(res.value, WAGE_DETECTOR(figures)), `${role} received money from ${probe.name}`).toEqual([]);
    });
  });
});

/**
 * F-01 (fixed in 14F): the payroll figures are refused at the SERVER FUNCTION for every non-Owner
 * role — not merely absent from a screen. "Refused" is asserted, not "refused or clean": the
 * database must not even be asked for the attendance rows.
 */
describe('F-01 (fixed) · the payroll functions REFUSE all seven non-Owner roles', () => {
  const PAYROLL: [string, () => Promise<unknown>][] = [
    ['calculateMonthlyPayroll', () => calculateMonthlyPayroll(2026, 1)],
    ['getMonthWageBill', () => getMonthWageBill(2026, 1)],
  ];
  describe.each(PAYROLL)('%s', (_name, run) => {
    it.each(NON_OWNER)('%s is refused with MisForbiddenError', async (role) => {
      as(role);
      expect(await outcome(run)).toBe('denied');
    });
  });

  it('the wage amount reader is refused too — the weaker door is closed, not just the front one', async () => {
    const { getWageAmount } = await import('./wage-type');
    for (const role of NON_OWNER) {
      as(role);
      expect(await outcome(() => getWageAmount('WG-DAILY-01')), role).toBe('denied');
    }
    as('OWNER');
    expect(await getWageAmount('WG-DAILY-01')).toBe(731.19);
  });
});

/**
 * F-02 (fixed in 14F): the general settings list is gated on settings.read, which ADMIN holds, and it
 * returned every non-AQL rule — the wage rates included. It now filters the wage rules out for
 * anyone without wages.read. All seven non-Owner roles are asserted, by what they RECEIVE.
 */
describe('F-02 (fixed) · the general settings list and the wage rules', () => {
  const WAGE_KEYS = ['DAILY_WAGE_DEFAULT', 'OT_MULTIPLIER', 'LATE_PENALTY_PER_MIN'];
  const keysOf = async () => (await getBusinessRules()).map((r: Row) => r.ruleKey as string);

  it('OWNER sees the three wage rules AND the ordinary ones, and never an AQL key', async () => {
    as('OWNER');
    const keys = await keysOf();
    for (const k of WAGE_KEYS) expect(keys).toContain(k);
    expect(keys).toContain('line_clearance.mode');
    expect(keys.filter((k) => k.startsWith('AQL_'))).toEqual([]);
  });

  it('ADMIN is served the ordinary rules and NONE of the wage rules — the list is not simply empty', async () => {
    as('ADMIN');
    const keys = await keysOf();
    expect(keys).toContain('line_clearance.mode');
    expect(keys.filter((k) => WAGE_KEYS.includes(k))).toEqual([]);
    const rows = await getBusinessRules();
    expect(findLeaks(rows, WAGE_DETECTOR())).toEqual([]);
  });

  it.each(NON_OWNER.filter((r) => r !== 'ADMIN'))('%s (no settings.read) is refused outright', async (role) => {
    as(role);
    expect(await outcome(() => getBusinessRules())).toBe('denied');
  });
});

describe('MIS-46 · wage WRITES are Owner-only and change nothing when refused', () => {
  const WRITES: { name: string; run: () => Promise<unknown>; table: string }[] = [
    { name: 'createWageType', run: () => createWageType({ name: 'X', unit: 'DAILY', amount: 733.77 }), table: 'misWageType' },
    { name: 'addWageRate', run: () => addWageRate('WG-DAILY-01', 799.13), table: 'misWageType' },
    { name: 'setWageTypeActive', run: () => setWageTypeActive('WG-DAILY-01', false), table: 'misWageType' },
  ];

  describe.each(WRITES)('$name', (w) => {
    it.each(NON_OWNER)('%s is refused and writes nothing', async (role) => {
      as(role);
      expect(await outcome(w.run)).toBe('denied');
      expect(state.writes).toEqual([]);
      expect(state.rawAudit).toEqual([]);
    });

    it('OWNER succeeds (the refusal above is the permission, not a broken fixture)', async () => {
      as('OWNER');
      expect(await outcome(w.run)).not.toBe('denied');
      expect(state.writes.length).toBeGreaterThan(0);
    });
  });

  // F-03 (fixed in 14F): the wage RULES are business rules, and updateBusinessRule needs only
  // settings.write, which ADMIN holds — but a wage rule edited there moves every payslip. The key
  // now decides the gate, so every non-Owner role is refused, ADMIN included.
  const RULE_WRITES: [string, string][] = [
    ['DAILY_WAGE_DEFAULT', '9999'],
    ['OT_MULTIPLIER', '9'],
    ['LATE_PENALTY_PER_MIN', '0'],
  ];

  describe.each(RULE_WRITES)('updateBusinessRule(%s)', (ruleKey, value) => {
    it.each(NON_OWNER)('%s is refused and writes nothing', async (role) => {
      as(role);
      expect(await outcome(() => updateBusinessRule(ruleKey, value))).toBe('denied');
      expect(state.writes).toEqual([]);
      expect(state.rawAudit).toEqual([]);
    });

    it('the Owner may (so the refusals are about WHO asks)', async () => {
      as('OWNER');
      expect(await outcome(() => updateBusinessRule(ruleKey, value))).not.toBe('denied');
      expect(state.rules.some((r) => r.ruleKey === ruleKey && r.ruleValue === value)).toBe(true);
    });
  });

  it('an ordinary rule is still editable by an Admin — the key decides, the door is not shut', async () => {
    as('ADMIN');
    expect(await outcome(() => updateBusinessRule('line_clearance.mode', 'SHIFT'))).not.toBe('denied');
    expect(state.rules.some((r) => r.ruleKey === 'line_clearance.mode' && r.ruleValue === 'SHIFT')).toBe(true);
  });
});

// ===========================================================================
// 2. aql.read — D6
// ===========================================================================
describe('D6 · AQL thresholds are Owner-only (aql.read)', () => {
  const AQL_KEYS = ['AQL_SAMPLE_SIZE', 'AQL_CRITICAL_MAX', 'AQL_MAJOR_MAX', 'AQL_MINOR_MAX'];

  it.each(NON_OWNER)('%s cannot read the AQL settings rows', async (role) => {
    as(role);
    expect(await outcome(() => getAqlThresholdRules())).toBe('denied');
  });

  it.each(NON_OWNER)('%s cannot change an AQL threshold through the dedicated function', async (role) => {
    as(role);
    expect(await outcome(() => updateAqlThreshold('AQL_MAJOR_MAX', '99'))).toBe('denied');
    expect(state.writes).toEqual([]);
  });

  it('OWNER can read and change them (the refusals above are the permission, not a broken fixture)', async () => {
    as('OWNER');
    const rows = await getAqlThresholdRules();
    expect(rows.map((r: Row) => r.ruleKey).sort()).toEqual([...AQL_KEYS].sort());
    await updateAqlThreshold('AQL_MAJOR_MAX', '7');
    expect(state.rules.some((r) => r.ruleKey === 'AQL_MAJOR_MAX' && r.ruleValue === '7')).toBe(true);
  });

  it("the general settings list never contains an AQL key, even for OWNER — they live on their own screen", async () => {
    for (const role of ['OWNER', 'ADMIN'] as const) {
      as(role);
      const keys = (await getBusinessRules()).map((r: Row) => r.ruleKey);
      expect(keys.filter((k: string) => k.startsWith('AQL_')), role).toEqual([]);
    }
  });

  it('updateAqlThreshold refuses a key that is not an AQL threshold', async () => {
    as('OWNER');
    await expect(updateAqlThreshold('DAILY_WAGE_DEFAULT', '1')).rejects.toThrow(/not an AQL threshold/);
  });

  // F-03 (fixed in 14F): the other door. updateBusinessRule accepts any key and needs only
  // settings.write; an AQL key now demands aql.read, so all seven non-Owner roles are refused.
  it.each(NON_OWNER)('%s cannot change an AQL threshold through the general rule editor either', async (role) => {
    as(role);
    expect(await outcome(() => updateBusinessRule('AQL_MAJOR_MAX', '99'))).toBe('denied');
    expect(state.writes).toEqual([]);
  });

  it('the Owner still can, through either door', async () => {
    as('OWNER');
    await updateBusinessRule('AQL_MAJOR_MAX', '8');
    expect(state.rules.some((r) => r.ruleKey === 'AQL_MAJOR_MAX' && r.ruleValue === '8')).toBe(true);
  });
});

// ===========================================================================
// 3. Audit payloads — wages never written
// ===========================================================================
describe('MIS-46 · audit payloads carry no wage figure', () => {
  const AMOUNTS = ['733.77', '799.13'];
  const auditDetector = { keys: /wage|salary|gross|otpay|penalty|netpay|amount|rate\b/i, values: [...AMOUNTS, ...BASE_SENTINELS] };

  it('OWNER creating, re-rating and switching a wage type writes clean audit rows — before AND after redaction', async () => {
    as('OWNER');
    await createWageType({ name: 'Night', unit: 'DAILY', amount: 733.77 });
    await addWageRate('WG-DAILY-01', 799.13);
    await setWageTypeActive('WG-DAILY-01', false);

    expect(state.rawAudit).toHaveLength(3);
    expect(state.auditRows).toHaveLength(3);
    // What the CALLER handed over — independent of redact() being there to catch a slip.
    expect(findLeaks(state.rawAudit.map((e) => [e.before, e.after]), auditDetector)).toEqual([]);
    // What was STORED.
    expect(findLeaks(state.auditRows.map((e) => [e.before, e.after]), auditDetector)).toEqual([]);
    // ...and the rows are real, not empty: the safe fields did get recorded.
    expect(state.auditRows[0].after.code).toBe('WG-DAILY-02');
    expect(state.auditRows[1].before.code).toBe('WG-DAILY-01');
  });

  // F-04 (closed in 14F alongside F-03): updateBusinessRule used to write { ruleKey, ruleValue } for
  // EVERY key, so editing a wage rule put the old and new wage in the audit row — redact() only
  // knows property names and `ruleValue` is not one. A wage rule now audits the KEY, never the figure.
  it.each(['DAILY_WAGE_DEFAULT', 'OT_MULTIPLIER', 'LATE_PENALTY_PER_MIN'])(
    'editing the wage rule %s writes neither the old nor the new value — before AND after redaction',
    async (ruleKey) => {
      as('OWNER');
      const old = state.rules.find((r) => r.ruleKey === ruleKey)!.ruleValue;
      await updateBusinessRule(ruleKey, '801.23');
      expect(state.rawAudit).toHaveLength(1);
      expect(state.auditRows).toHaveLength(1);
      for (const rows of [state.rawAudit, state.auditRows]) {
        const text = JSON.stringify(rows);
        expect(text).not.toContain('801.23');
        expect(text).not.toContain(old);
        expect(text).toContain(ruleKey); // the row still says WHICH rule changed
        expect(text).toContain('UPDATE_RULE');
      }
    },
  );

  it('an ordinary rule still audits its old and new value — the audit is not simply gutted', async () => {
    as('ADMIN');
    await updateBusinessRule('line_clearance.mode', 'SHIFT');
    expect(state.auditRows[0].before).toEqual({ ruleKey: 'line_clearance.mode', ruleValue: 'JOB' });
    expect(state.auditRows[0].after).toEqual({ ruleKey: 'line_clearance.mode', ruleValue: 'SHIFT' });
  });
});

describe('redact() — the last line of defence', () => {
  it('blanks the wage-shaped top-level keys it knows', () => {
    const out = redact({ id: 'x', wage: 1, wageAmount: 2, dailyWage: 3, rate: 4, salary: 5, amount: 6, netPay: 7 });
    expect(out).toEqual({ id: 'x', wage: '[redacted]', wageAmount: '[redacted]', dailyWage: '[redacted]', rate: '[redacted]', salary: '[redacted]', amount: '[redacted]', netPay: '[redacted]' });
  });

  it('returns null for an empty diff and leaves harmless keys alone', () => {
    expect(redact(null)).toBeNull();
    expect(redact({ code: 'WG-DAILY-01' })).toEqual({ code: 'WG-DAILY-01' });
  });

  // F-05: redact() only looks at the top level and only at seven exact names. The callers
  // are clean today (see the static scan below), so this is a latent hole, not a live one.
  it.fails('F-05: a wage nested one level down is redacted too', () => {
    expect(JSON.stringify(redact({ row: { amount: 731.19 } }))).not.toContain('731.19');
  });

  it.fails('F-05: the payroll field names are redacted (basicWage, otPay, grossPay, latePenalty)', () => {
    const out = redact({ basicWage: 1111, otPay: 2222, grossPay: 3333, latePenalty: 4444 });
    expect(JSON.stringify(out)).not.toMatch(/1111|2222|3333|4444/);
  });
});

// ===========================================================================
// 4. Money that the SCREEN hides but the SERVER still sends (F-06)
//    Material rates and stock prices are not wages, and no decision records who may see
//    them — but the screens hide them behind `isOwner` (= wages.read), so the intent is
//    plain, and a hidden column is not a withheld value: it is in the page payload.
// ===========================================================================
describe('F-06 · material rates and stock prices reach the browser of roles whose screen hides them', () => {
  it('OWNER receives both (fixture is live)', async () => {
    as('OWNER');
    expect(JSON.stringify((await getStoreReport({ from: YESTERDAY, to: YESTERDAY })).rows)).toContain('pricePerUnit');
    expect(JSON.stringify(await getBom('o1'))).toContain('ratePerUnit');
  });

  // reports.read: ADMIN, SUPERVISOR, QC, SUPER_ATTENDANCE_OPERATOR — orders.read: ADMIN, SUPERVISOR, QC.
  for (const role of ['ADMIN', 'SUPERVISOR', 'QC', 'SUPER_ATTENDANCE_OPERATOR'] as const) {
    it.fails(`${role}: getStoreReport withholds pricePerUnit`, async () => {
      as(role);
      const res = await outcome(() => getStoreReport({ from: YESTERDAY, to: YESTERDAY }));
      if (res === 'denied') return; // refusing the role would also be correct — a fix turns this red
      expect(JSON.stringify(res.value)).not.toMatch(/pricePerUnit/);
    });
  }

  for (const role of ['ADMIN', 'SUPERVISOR', 'QC'] as const) {
    it.fails(`${role}: getBom withholds ratePerUnit`, async () => {
      as(role);
      const res = await outcome(() => getBom('o1'));
      if (res === 'denied') return;
      expect(JSON.stringify(res.value)).not.toMatch(/ratePerUnit/);
    });
  }
});
