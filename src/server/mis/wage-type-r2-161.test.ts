/**
 * R2-161 — correcting a wage rate on a day that already has a rate must UPDATE that row (audited),
 * not crash on the @@unique([code, effectiveFrom]) constraint. A different day still adds a row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { addWageRate } = await import('./wage-type');

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('addWageRate — same effective day', () => {
  it('updates the existing row instead of throwing P2002, and audits before/after', async () => {
    const before = state.wageTypes.filter((r) => r.code === 'WG-DAILY-01').length;
    const row = await addWageRate('WG-DAILY-01', 750.5, d('2026-01-01'));
    expect(row.amount).toBe(750.5);
    const daily = state.wageTypes.filter((r) => r.code === 'WG-DAILY-01');
    expect(daily).toHaveLength(before);
    expect(daily.find((r) => r.effectiveFrom.getTime() === d('2026-01-01').getTime())!.amount).toBe(750.5);
    expect(state.writes).not.toContain('misWageType.create');
    const audit = state.auditRows.find((r) => r.action === 'wageType.updateRate');
    expect(audit).toBeTruthy();
    expect(audit!.before).toBeTruthy();
    expect(audit!.after).toBeTruthy();
  });

  it('a new day still adds a new dated row', async () => {
    const before = state.wageTypes.length;
    await addWageRate('WG-DAILY-01', 800, d('2026-09-01'));
    expect(state.wageTypes).toHaveLength(before + 1);
    expect(state.auditRows.some((r) => r.action === 'wageType.addRate')).toBe(true);
  });
});
