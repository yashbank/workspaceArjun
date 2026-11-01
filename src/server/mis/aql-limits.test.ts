/** R2-314: the Major / Minor AQL limit rows are Owner-only (aql.read) like the thresholds, and default to 1.5 / 4.0. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const rows: Row[] = [];
const getMisRole = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/db', () => ({
  db: {
    misBusinessRule: {
      findFirst: async ({ where }: { where: { ruleKey: string } }) => rows.find((r) => r.ruleKey === where.ruleKey) ?? null,
      create: async ({ data }: { data: Row }) => { const row = { id: `r${rows.length + 1}`, ...data }; rows.push(row); return row; },
      findMany: async ({ where }: { where: { ruleKey: { in: string[] } } }) => rows.filter((r) => where.ruleKey.in.includes(String(r.ruleKey))),
    },
  },
}));

const { getAqlLimitRules, updateAqlThreshold } = await import('./business-rules');

beforeEach(() => { rows.length = 0; });

describe('R2-314 getAqlLimitRules', () => {
  it('the OWNER gets the two limit rows, created with 1.5 (major) and 4.0 (minor)', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const out = await getAqlLimitRules();
    expect(out.map((r) => [r.ruleKey, r.ruleValue])).toEqual([['AQL_MAJOR_LIMIT', '1.5'], ['AQL_MINOR_LIMIT', '4']]);
    expect((await getAqlLimitRules()).length).toBe(2); // idempotent
  });
  it.each(['ADMIN', 'SUPERVISOR', 'QC'])('%s is refused', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(getAqlLimitRules()).rejects.toThrow(/Not permitted: aql\.read/);
    await expect(updateAqlThreshold('AQL_MAJOR_LIMIT', '2.5')).rejects.toThrow(/Not permitted: aql\.read/);
  });
  it('updateAqlThreshold still refuses a key that is neither a threshold nor a limit', async () => {
    getMisRole.mockResolvedValue('OWNER');
    await expect(updateAqlThreshold('wage.rate', '1')).rejects.toThrow(/not an AQL threshold/);
  });
});
