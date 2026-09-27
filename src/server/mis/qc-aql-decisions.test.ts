/**
 * Phase 18 · MIS-196 — an effective-dated AQL threshold change never moves a decision already
 * recorded. `rule-history.test.ts`'s "QC decisions are written once and never recomputed"
 * block already proves this STATICALLY (only `recordAqlSample` reads the thresholds; the stored
 * row has no column a threshold change could rewrite) — this is the functional proof the phase's
 * own acceptance check asks for: record a sample, change the threshold, record another, and
 * confirm the first is unmoved on re-read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const state: { rules: Row[]; defectTypes: Row[]; checks: Row[] } = { rules: [], defectTypes: [], checks: [] };
let seq = 0;
const nextId = () => `id-${++seq}`;

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const db = {
  misBusinessRule: {
    findFirst: async ({ where, orderBy }: Row) => {
      let rows = state.rules.filter((r) => r.ruleKey === where.ruleKey);
      if (where.effectiveFrom?.lte) rows = rows.filter((r) => r.effectiveFrom <= where.effectiveFrom.lte);
      // Tie-break by insertion order (`_seq`), not just the millisecond-resolution timestamp —
      // two revisions created in the same test can share a `new Date()` tick, and "latest wins"
      // must still mean the one actually written last, not whichever a stable sort leaves first.
      const dir = orderBy?.effectiveFrom === 'asc' ? 1 : -1;
      rows = rows.sort((a, b) => dir * (a.effectiveFrom - b.effectiveFrom) || dir * (a._seq - b._seq));
      return rows[0] ?? null;
    },
    create: async ({ data }: Row) => { const row = { id: nextId(), _seq: ++seq, ...data }; state.rules.push(row); return row; },
  },
  misDefectType: {
    findMany: async ({ where }: Row) => state.defectTypes.filter((d) => where.id.in.includes(d.id)),
  },
  misQcCheck: {
    create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.checks.push(row); return row; },
    findUnique: async ({ where }: Row) => state.checks.find((c) => c.id === where.id) ?? null,
  },
};
vi.mock('@/server/db', () => ({ get db() { return db; } }));

const { recordAqlSample } = await import('./qc');
const { updateAqlThreshold } = await import('./business-rules');

beforeEach(() => {
  seq = 0;
  state.rules = [];
  state.checks = [];
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  state.defectTypes = [{ id: 'dt-major', severity: 'MAJOR' }];
});

describe('MIS-196 — a threshold change never moves a decision already recorded', () => {
  it('a sample that PASSED under the old threshold still reads PASS after the threshold tightens', async () => {
    // Default AQL_MAJOR_MAX is 2 (business-rules.ts's own seeded default) — 2 majors passes.
    const { check: first, result: firstResult } = await recordAqlSample({
      orderId: 'ord-1',
      sampleSize: 32,
      defects: [{ defectTypeId: 'dt-major', qty: 2 }],
    });
    expect(firstResult.decision).toBe('ACCEPT');
    expect(first.result).toBe('PASS');

    // Tighten the rule — a real Owner decision, effective now.
    await updateAqlThreshold('AQL_MAJOR_MAX', '1');

    // The SAME defect count recorded again today now fails under the new rule…
    const { result: secondResult } = await recordAqlSample({
      orderId: 'ord-2',
      sampleSize: 32,
      defects: [{ defectTypeId: 'dt-major', qty: 2 }],
    });
    expect(secondResult.decision).toBe('REJECT');

    // …but the FIRST sample's stored row is untouched — nothing re-scores it on read.
    const reread = await db.misQcCheck.findUnique({ where: { id: first.id } });
    expect(reread!.result).toBe('PASS');
  });
});

describe('reject → rework → re-sample → accept (MIS-199)', () => {
  // There is no dedicated "rework" state anywhere in qc.ts or the MisQcCheck schema — the
  // workflow is built entirely from calling recordAqlSample again: a rejected batch is reworked
  // on the shop floor (outside this system) and a fresh sample is drawn and recorded as its own
  // new row. This proves that sequence actually works end to end, and that an earlier REJECT
  // never blocks or taints a later, independent ACCEPT for the same order.
  it('a rejected sample does not block a later re-sample of the same order from being accepted', async () => {
    const rejected = await recordAqlSample({
      orderId: 'ord-1',
      sampleSize: 32,
      defects: [{ defectTypeId: 'dt-major', qty: 5 }], // well over the default max of 2
    });
    expect(rejected.result.decision).toBe('REJECT');

    // Reworked, re-sampled — a fresh check, not an edit of the rejected one.
    const accepted = await recordAqlSample({ orderId: 'ord-1', sampleSize: 32, defects: [] });
    expect(accepted.result.decision).toBe('ACCEPT');

    // Both rows persist, independently — the reject is not erased or overwritten by the accept.
    expect(state.checks).toHaveLength(2);
    expect(state.checks.map((c) => c.result)).toEqual(['FAIL', 'PASS']);
    expect(rejected.check.id).not.toBe(accepted.check.id);
  });
});
