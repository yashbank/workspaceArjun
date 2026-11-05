import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows: { id: string; ruleKey: string; ruleValue: string }[] = [];
const requirePermission = vi.fn(async (_a: string) => ({ userId: 'u1', role: 'OWNER' }));
const logAuditEvent = vi.fn(async (_e: unknown) => undefined);
vi.mock('@/server/mis/auth', () => ({ requirePermission: (a: string) => requirePermission(a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (e: unknown) => logAuditEvent(e) }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/db', () => ({
  db: {
    misBusinessRule: {
      findFirst: async () => rows[0] ?? null,
      create: async ({ data }: { data: { ruleKey: string; ruleValue: string } }) => { const r = { id: 'r1', ...data }; rows.push(r); return r; },
      update: async ({ data }: { data: { ruleValue: string } }) => { rows[0].ruleValue = data.ruleValue; return rows[0]; },
    },
  },
}));

const { getOrgTheme, saveOrgTheme } = await import('./theme');

beforeEach(() => { rows.length = 0; vi.clearAllMocks(); });

describe('Theme Studio server', () => {
  it('reads the default when nothing is saved', async () => {
    expect(await getOrgTheme()).toEqual({ paletteId: 'indigo', fontPairId: 'inter' });
  });

  it('saves behind data.reset, audits, and reads back', async () => {
    await saveOrgTheme({ paletteId: 'teal', fontPairId: 'system' });
    expect(requirePermission).toHaveBeenCalledWith('data.reset');
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE_THEME', after: { paletteId: 'teal', fontPairId: 'system' } }));
    expect(await getOrgTheme()).toEqual({ paletteId: 'teal', fontPairId: 'system' });
  });

  it('refuses free-form values and writes nothing', async () => {
    await expect(saveOrgTheme({ paletteId: '#fff;}', fontPairId: 'system' })).rejects.toThrow();
    expect(rows).toHaveLength(0);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('a non-Owner is refused by the gate before anything is read or written', async () => {
    requirePermission.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(saveOrgTheme({ paletteId: 'teal', fontPairId: 'system' })).rejects.toThrow('Forbidden');
    expect(rows).toHaveLength(0);
  });
});
