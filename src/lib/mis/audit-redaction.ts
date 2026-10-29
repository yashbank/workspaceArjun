/**
 * Audit payload redaction — the decision, in one place (D24).
 *
 *  WRITE time (`redactForStorage`): WAGE / payroll keys are replaced with "[redacted]" at ANY depth,
 *  so a wage can never be stored, whoever the actor is. Also masked: the BOM/PO line rate and the
 *  generic names (`amount`, `rate`) that cannot be told apart from a wage by name alone.
 *  What is NOT masked any more: a stock item's `pricePerUnit` and a supplier invoice amount.
 *  They are not wages, and the Owner's audit spec line "Order pricing / material rates" needs the
 *  old -> new price.
 *
 *  READ time (`redactAuditForRole`): for every role without `wages.read`, EVERY key in both lists
 *  (wage + non-wage money) is removed at any depth. Rows already stored as "[redacted]" stay so.
 *
 *  Why no wage can leak: the read-time list is a superset of the write-time list, the wage keys are
 *  in both, and the write side never lets a wage key's value through. The only money kept at rest
 *  that is not masked is non-wage money, and the read side strips it for everyone but the Owner.
 *
 * Pure: no Prisma, no React.
 */
import { can } from './permissions';
import { isOwnerOnlyPayrollRuleKey } from './rule-keys';
import type { MisRoleName } from './roles';

export const REDACTED = '[redacted]';

/** Payroll / wage money. Never stored, never shown to anyone. `hra` and `allowance` are payslip money
 *  columns (MisPayslip). `discrepancy` (a physical-count QUANTITY) is deliberately NOT here. */
export const WAGE_KEYS: readonly string[] = [
  'wage', 'wageAmount', 'dailyWage', 'salary', 'netPay',
  'otRatePerHour', 'hra', 'hraAmount', 'allowance', 'allowanceAmount', 'bonusAmount',
  'basicWage', 'otPay', 'bonus', 'extraPay', 'latePenalty', 'grossPay',
];

/** Ambiguous names that could carry a wage: masked at write like a wage. */
export const AMBIGUOUS_KEYS: readonly string[] = ['rate', 'amount'];

/** Material money that is not a wage: the Owner may see it, nobody else. */
export const OWNER_ONLY_MONEY_KEYS: readonly string[] = ['pricePerUnit', 'supplierInvoiceAmount', 'invoiceAmount'];

/** BOM / PO line rate: still masked at write (existing material-money tests lock that), Owner-only at read. */
const LINE_RATE_KEYS: readonly string[] = ['ratePerUnit'];

const WRITE_KEYS = new Set<string>([...WAGE_KEYS, ...AMBIGUOUS_KEYS, ...LINE_RATE_KEYS]);
const READ_KEYS = new Set<string>([...WRITE_KEYS, ...OWNER_ONLY_MONEY_KEYS]);

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function walk(value: unknown, keys: Set<string>, mode: 'mask' | 'drop'): unknown {
  if (Array.isArray(value)) return value.map((v) => walk(v, keys, mode));
  if (!isPlain(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (keys.has(k)) {
      if (mode === 'mask') out[k] = REDACTED;
      continue;
    }
    out[k] = walk(v, keys, mode);
  }
  return out;
}

/** What may be stored. Masks (keeps the shape) at any depth. */
export function redactForStorage(input: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!input) return null;
  return walk(input, WRITE_KEYS, 'mask') as Record<string, unknown>;
}

/** A stored before/after as `role` may see it: unchanged for `wages.read`, else every money key removed. */
export function redactAuditForRole<T>(role: MisRoleName | null | undefined, payload: T): T {
  const safe = dropUnclassifiedRuleValue(payload) as T;
  if (can(role, 'wages.read')) return safe;
  return walk(safe, READ_KEYS, 'drop') as T;
}

/**
 * `ruleValue` is money when the rule is a wage rule (payroll reads three). Writers keep wage rule values
 * out of the row, but a legacy row, or one with no `ruleKey` to classify it, fails CLOSED: the value is
 * shown, to anyone, only beside a `ruleKey` that is known not to be a wage rule.
 */
function dropUnclassifiedRuleValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropUnclassifiedRuleValue);
  if (!isPlain(value)) return value;
  const classified = typeof value.ruleKey === 'string' && !isOwnerOnlyPayrollRuleKey(value.ruleKey);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'ruleValue' && !classified) continue;
    out[k] = dropUnclassifiedRuleValue(v);
  }
  return out;
}

export type DiffEntry = { path: string; from: unknown; to: unknown };

function flatten(value: unknown, prefix: string, out: Map<string, unknown>) {
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(prefix, value);
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (isPlain(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix) out.set(prefix, value);
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, value);
  }
}

/** Changed leaves only, old -> new. A key absent on one side shows as `undefined` there. */
export function diffPayloads(before: unknown, after: unknown): DiffEntry[] {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  if (before != null) flatten(before, '', a);
  if (after != null) flatten(after, '', b);
  const paths = [...new Set([...a.keys(), ...b.keys()])].filter(Boolean);
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  return paths.filter((p) => !same(a.get(p), b.get(p))).map((p) => ({ path: p, from: a.get(p), to: b.get(p) }));
}

/** A diff value as short text for the audit screen. */
export function fmtDiffValue(v: unknown): string {
  if (v === undefined) return '\u2014';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export type AuditChange = { path: string; from: string; to: string };

/** What the audit screen shows for one row: role-redacted, changed fields only, severity pulled out of `after`. */
export function auditChangesForRole(
  role: MisRoleName | null | undefined,
  before: unknown,
  after: unknown,
): { changes: AuditChange[]; severity: string | null } {
  const b = redactAuditForRole(role, before) as Record<string, unknown> | null;
  const a0 = redactAuditForRole(role, after) as Record<string, unknown> | null;
  let severity: string | null = null;
  let a = a0;
  if (a0 && isPlain(a0) && typeof a0.severity === 'string') {
    severity = a0.severity;
    const { severity: _s, ...rest } = a0;
    void _s;
    a = rest;
  }
  return { changes: diffPayloads(b, a).map((d) => ({ path: d.path, from: fmtDiffValue(d.from), to: fmtDiffValue(d.to) })), severity };
}
