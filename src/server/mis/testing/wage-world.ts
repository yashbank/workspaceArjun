/**
 * A small in-memory world for the money-leak tests (Phase 14): a fake database that
 * understands just enough Prisma to run the wage-bearing server functions, a fixture full of
 * SENTINEL money, and the leak detector.
 *
 * Shared by `server/mis/wage-leak.test.ts` (server functions) and
 * `app/(mis)/mis/wage-screens.test.tsx` (what a page hands to the browser).
 *
 * The fake db THROWS on any query operator it does not understand, so a new `where` clause
 * in the app makes a test fail loudly instead of quietly matching everything.
 *
 * Test-only. Nothing in the app imports this.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a fake db row is whatever the test seeds
export type Row = Record<string, any>;

// ---------------------------------------------------------------------------
// Sentinel money — deliberately odd numbers, so an exact-value match cannot be a coincidence
// with a count, an id or a date.
// ---------------------------------------------------------------------------
export const DAILY_WAGE = 731.19;
export const MONTHLY_WAGE = 18734.56;
export const RULE_DAILY = '649.37';
export const RULE_OT = '2.375';
export const RULE_LATE = '0.83';
export const ITEM_PRICE = 88.41;
export const BOM_RATE = 12.77;
/** Values that must never reach a non-Owner. Payroll's derived figures are added at runtime. */
export const BASE_SENTINELS = [String(DAILY_WAGE), String(MONTHLY_WAGE), RULE_DAILY, RULE_OT, RULE_LATE];

export const state: {
  wageTypes: Row[];
  rules: Row[];
  attendance: Row[];
  storeTxns: Row[];
  boms: Row | null;
  /** the `where` of every attendance query, so a test can assert the month bounds */
  attendanceWhere: Row[];
  auditRows: Row[];
  rawAudit: Row[];
  writes: string[];
} = { wageTypes: [], rules: [], attendance: [], storeTxns: [], boms: null, attendanceWhere: [], auditRows: [], rawAudit: [], writes: [] };

const match = (row: Row, where: Row = {}): boolean =>
  Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const ops = Object.keys(cond);
      const known = ops.every((op) => ['lte', 'gte', 'in'].includes(op));
      if (!known) throw new Error(`fake db: unsupported operator in ${JSON.stringify(cond)}`);
      if ('lte' in cond && !(value <= cond.lte)) return false;
      if ('gte' in cond && !(value >= cond.gte)) return false;
      if ('in' in cond && !cond.in.includes(value)) return false;
      return true;
    }
    return value === cond;
  });

const sortRows = (rows: Row[], orderBy: Row | Row[] | undefined): Row[] => {
  const keys = ([] as Row[]).concat(orderBy ?? []).flatMap((o) => Object.entries(o));
  return [...rows].sort((a, b) => {
    for (const [field, dir] of keys) {
      if (typeof dir !== 'string') continue;
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
};

/**
 * Mirrors the schema's `@@unique([code|ruleKey, effectiveFrom])` where effectiveFrom is a
 * `@db.Date`: two rows for the same key on the same calendar day collide, whatever the time.
 */
function assertUniqueOnDay(rows: Row[], keyField: string, data: Row) {
  const day = (d: Date) => new Date(d).toISOString().slice(0, 10);
  if (rows.some((r) => r[keyField] === data[keyField] && day(r.effectiveFrom) === day(data.effectiveFrom))) {
    throw Object.assign(new Error(`Unique constraint failed on (${keyField}, effectiveFrom)`), { code: 'P2002' });
  }
}

let idSeq = 0;
const nextId = () => `id-${++idSeq}`;

export const fakeDb = {
  misWageType: {
    findMany: async (args: Row = {}) => {
      const rows = sortRows(state.wageTypes.filter((r) => match(r, args.where)), args.orderBy);
      return args.select ? rows.map((r) => Object.fromEntries(Object.keys(args.select).map((k) => [k, r[k]]))) : rows;
    },
    findFirst: async (args: Row = {}) => sortRows(state.wageTypes.filter((r) => match(r, args.where)), args.orderBy)[0] ?? null,
    create: async ({ data }: Row) => {
      assertUniqueOnDay(state.wageTypes, 'code', data);
      state.writes.push('misWageType.create');
      const row = { id: nextId(), isActive: true, deletedAt: null, nameHi: null, ...data };
      state.wageTypes.push(row);
      return row;
    },
    update: async ({ where, data }: Row) => {
      state.writes.push('misWageType.update');
      const row = state.wageTypes.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
  },
  misBusinessRule: {
    findMany: async (args: Row = {}) => sortRows(state.rules.filter((r) => match(r, args.where)), args.orderBy),
    findFirst: async (args: Row = {}) => sortRows(state.rules.filter((r) => match(r, args.where)), args.orderBy)[0] ?? null,
    create: async ({ data }: Row) => {
      assertUniqueOnDay(state.rules, 'ruleKey', data);
      state.writes.push('misBusinessRule.create');
      const row = { id: nextId(), ...data };
      state.rules.push(row);
      return row;
    },
  },
  // Honours the date range, as the real query does — a fake that returned every row would let a
  // payroll bug about WHICH month hide behind the fixture.
  misAttendance: {
    findMany: async (args: Row = {}) => {
      state.attendanceWhere.push(args.where ?? {});
      return state.attendance.filter((r) => (args.where?.date ? match(r, { date: args.where.date }) : true));
    },
  },
  misStoreTransaction: { findMany: async () => state.storeTxns },
  misBom: { findUnique: async () => state.boms },
  misEmployee: {
    findUnique: async () => ({ ...EMP, role: 'WORKER', isActive: true, deletedAt: null, userProfile: null }),
  },
  misAuditLog: {
    create: async ({ data }: Row) => {
      state.auditRows.push(JSON.parse(JSON.stringify(data)));
      return data;
    },
    findMany: async () => state.auditRows.map((r, i) => ({ id: `log-${i}`, createdAt: LONG_AGO, entityId: null, actor: null, ...r })),
  },
  $transaction: (ops: unknown[]) => Promise.all(ops),
};

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
export const LONG_AGO = new Date('2026-01-01T00:00:00Z');
export const EMP = { id: 'e1', name: 'Asha', employeeCode: 'E-001' };

/** Reset the world to its starting state. Call from beforeEach. */
export function seedWorld() {
  idSeq = 0;
  state.writes = [];
  state.attendanceWhere = [];
  state.auditRows = [];
  state.rawAudit = [];
  state.wageTypes = [
    { id: 'w1', code: 'WG-DAILY-01', name: 'General', nameHi: null, amount: DAILY_WAGE, unit: 'DAILY', effectiveFrom: LONG_AGO, isActive: true, deletedAt: null },
    { id: 'w2', code: 'WG-MONTHLY-01', name: 'Staff', nameHi: null, amount: MONTHLY_WAGE, unit: 'MONTHLY', effectiveFrom: LONG_AGO, isActive: true, deletedAt: null },
  ];
  const rule = (ruleKey: string, ruleValue: string, label: string) => ({
    id: nextId(), ruleKey, ruleValue, valueType: 'string', label, description: null, effectiveFrom: LONG_AGO, updatedById: null,
  });
  state.rules = [
    rule('DAILY_WAGE_DEFAULT', RULE_DAILY, 'Daily wage default'),
    rule('OT_MULTIPLIER', RULE_OT, 'Overtime multiplier'),
    rule('LATE_PENALTY_PER_MIN', RULE_LATE, 'Late penalty per minute'),
    rule('line_clearance.mode', 'JOB', 'Line clearance mode'),
    rule('AQL_SAMPLE_SIZE', '47', 'AQL sample size'),
    rule('AQL_CRITICAL_MAX', '0', 'AQL critical defect max'),
    rule('AQL_MAJOR_MAX', '6', 'AQL major defect max'),
    rule('AQL_MINOR_MAX', '13', 'AQL minor defect max'),
  ];
  // Three January days (the closed month the tests price), and two on/after 10 Feb — "this month".
  state.attendance = [
    { id: 'a1', date: new Date('2026-01-05'), status: 'PRESENT', lateMinutes: 300, otMinutes: 0, employee: EMP, shift: { name: 'Day' } },
    { id: 'a2', date: new Date('2026-01-06'), status: 'PRESENT', lateMinutes: 0, otMinutes: 90, employee: EMP, shift: { name: 'Day' } },
    { id: 'a3', date: new Date('2026-01-07'), status: 'PRESENT', lateMinutes: 0, otMinutes: 0, employee: EMP, shift: { name: 'Day' } },
    { id: 'a4', date: new Date('2026-02-10'), status: 'PRESENT', lateMinutes: 0, otMinutes: 0, employee: EMP, shift: { name: 'Day' } },
    { id: 'a5', date: new Date('2026-02-11'), status: 'PRESENT', lateMinutes: 0, otMinutes: 0, employee: EMP, shift: { name: 'Day' } },
  ];
  state.storeTxns = [
    { id: 't1', itemId: 'i1', type: 'IN', quantity: 5, createdAt: LONG_AGO, item: { id: 'i1', name: 'Kraft', code: 'BPP-RM-1', unit: 'KG', pricePerUnit: ITEM_PRICE } },
  ];
  state.boms = {
    id: 'b1', orderId: 'o1', status: 'APPROVED',
    stages: [{ id: 's1', stageName: 'Print', process: { name: 'Printing' }, materials: [{ id: 'm1', description: 'Ink', quantity: 2, unit: 'KG', ratePerUnit: BOM_RATE, item: { name: 'Ink', unit: 'KG' } }] }],
  };
}

// ---------------------------------------------------------------------------
// The detector
// ---------------------------------------------------------------------------
export type Detector = { keys: RegExp; values: string[]; words?: RegExp };

/** Wage vocabulary in a KEY, and exact sentinel values / wage words in a VALUE. */
export const WAGE_DETECTOR = (extraValues: string[] = []): Detector => ({
  keys: /wage|salary|gross|otpay|penalty|netpay|payroll|payslip|amount/i,
  values: [...BASE_SENTINELS, ...extraValues],
  words: /wage|salary|₹/i,
});

/** Every place a value carries money. Empty array = clean. */
export function findLeaks(value: unknown, d: Detector): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (v === null || v === undefined || v instanceof Date) return;
    if (Array.isArray(v)) return v.forEach((child, i) => walk(child, `${path}[${i}]`));
    if (typeof v === 'object') {
      for (const [k, child] of Object.entries(v as Row)) {
        const here = path ? `${path}.${k}` : k;
        if (d.keys.test(k)) hits.push(`key ${here}`);
        walk(child, here);
      }
      return;
    }
    const text = String(v);
    if (d.values.includes(text)) hits.push(`value ${path} = ${text}`);
    else if (typeof v === 'string' && d.words?.test(text)) hits.push(`word ${path} = ${text}`);
  };
  walk(value, '');
  return hits;
}

export const isForbidden = (e: unknown) => (e as Error)?.name === 'MisForbiddenError';

/** Run `fn`; 'denied' for a MisForbiddenError, otherwise the value. Any other error is a real failure. */
export async function outcome<T>(fn: () => Promise<T>): Promise<'denied' | { value: T }> {
  try {
    return { value: await fn() };
  } catch (e) {
    if (isForbidden(e)) return 'denied';
    throw e;
  }
}

/**
 * What a server component hands to the browser: the props of every element in the tree it
 * returns, serialised. Functions and symbols drop out; data stays.
 */
export function propsPayload(element: unknown): unknown {
  return JSON.parse(
    JSON.stringify(element, (key, value) => {
      if (key === '_owner' || key === '_store' || key === 'type' || key === '$$typeof') return undefined;
      if (typeof value === 'function') return undefined;
      return value;
    }) ?? 'null',
  );
}
