import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The `factory.timezone` rule (D22): seeded, read with a safe fallback, validated on write. */

const rules: { ruleKey: string; ruleValue: string; effectiveFrom: Date; valueType: string; label: string; description: string | null }[] = [];
const created = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    misBusinessRule: {
      findFirst: async ({ where, orderBy }: { where: { ruleKey: string; effectiveFrom?: { lte: Date } }; orderBy?: unknown }) => {
        const hits = rules.filter((r) => r.ruleKey === where.ruleKey && (!where.effectiveFrom || r.effectiveFrom <= where.effectiveFrom.lte));
        return (orderBy ? hits.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()) : hits)[0] ?? null;
      },
      create: async ({ data }: { data: (typeof rules)[number] }) => {
        created(data);
        rules.push(data);
        return data;
      },
    },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const { getFactoryTimezone, updateBusinessRule } = await import('./business-rules');

const seed = (ruleValue: string) =>
  rules.push({ ruleKey: 'factory.timezone', ruleValue, effectiveFrom: new Date('2026-01-01'), valueType: 'string', label: 'x', description: null });

beforeEach(() => {
  rules.length = 0;
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'admin-1' });
  getMisRole.mockResolvedValue('ADMIN');
});

describe('getFactoryTimezone (D22)', () => {
  it('seeds the rule as Asia/Kolkata the first time it is read, and returns it', async () => {
    expect(await getFactoryTimezone()).toBe('Asia/Kolkata');
    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0][0]).toMatchObject({ ruleKey: 'factory.timezone', ruleValue: 'Asia/Kolkata', valueType: 'string' });
  });

  it('does not seed twice', async () => {
    await getFactoryTimezone();
    await getFactoryTimezone();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it('returns whatever valid zone the rule holds', async () => {
    seed('Asia/Dubai');
    expect(await getFactoryTimezone()).toBe('Asia/Dubai');
  });

  it('falls back to the seeded default — never the server’s clock — if the stored value is not a real zone', async () => {
    seed('IST');
    expect(await getFactoryTimezone()).toBe('Asia/Kolkata');
  });
});

describe('changing the zone', () => {
  it.each(['IST', 'Mars/Olympus', '', 'Asia/Kolkata; DROP TABLE mis_business_rules'])('refuses %j', async (bad) => {
    seed('Asia/Kolkata');
    await expect(updateBusinessRule('factory.timezone', bad)).rejects.toThrow(/IANA/);
    expect(created).not.toHaveBeenCalled();
  });

  it('needs settings.write', async () => {
    seed('Asia/Kolkata');
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(updateBusinessRule('factory.timezone', 'Asia/Dubai')).rejects.toThrow(/Not permitted/);
  });

  it('accepts a real zone as a new effective-dated revision', async () => {
    seed('Asia/Kolkata');
    await expect(updateBusinessRule('factory.timezone', 'Asia/Dubai')).resolves.toBeDefined();
    expect(created).toHaveBeenCalledTimes(1);
  });
});
