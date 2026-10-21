/**
 * R2-114 — wage-type DETAILS edit (name / Hindi name, labels only) and the visible rate history.
 * Owner only; a rename never touches a rate; the audit row carries names, never an amount.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES } from '@/lib/mis/roles';

import { BASE_SENTINELS, fakeDb, findLeaks, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { updateWageTypeDetails, listWageRateHistory, listWageTypes } = await import('./wage-type');

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  // WG-DAILY-01: 731.19 from 1 Jan, 760.50 from 1 Jun, 800.25 scheduled for 1 Dec.
  state.wageTypes.push(
    { id: 'w1b', code: 'WG-DAILY-01', name: 'General', nameHi: null, amount: 760.5, unit: 'DAILY', otRatePerHour: 120.75, effectiveFrom: d('2026-06-01'), isActive: true, deletedAt: null },
    { id: 'w1c', code: 'WG-DAILY-01', name: 'General', nameHi: null, amount: 800.25, unit: 'DAILY', effectiveFrom: d('2026-12-01'), isActive: true, deletedAt: null },
  );
});

describe('updateWageTypeDetails', () => {
  it('renames every dated row of the code and touches no rate', async () => {
    const amountsBefore = state.wageTypes.map((r) => [r.id, r.amount, r.otRatePerHour ?? null, r.effectiveFrom]);
    await updateWageTypeDetails('WG-DAILY-01', { name: '  Machine operator ', nameHi: 'मशीन ऑपरेटर' });
    const daily = state.wageTypes.filter((r) => r.code === 'WG-DAILY-01');
    expect(daily).toHaveLength(3);
    expect(daily.every((r) => r.name === 'Machine operator' && r.nameHi === 'मशीन ऑपरेटर')).toBe(true);
    expect(state.wageTypes.map((r) => [r.id, r.amount, r.otRatePerHour ?? null, r.effectiveFrom])).toEqual(amountsBefore);
    expect(state.wageTypes.find((r) => r.code === 'WG-MONTHLY-01')!.name).toBe('Staff');
    expect(state.writes.filter((w) => w === 'misWageType.create')).toEqual([]); // no new rate row
  });

  it('audits names before/after — never an amount', async () => {
    await updateWageTypeDetails('WG-DAILY-01', { name: 'Operator', nameHi: '' });
    const row = state.auditRows.find((r) => r.action === 'wageType.updateDetails');
    expect(row).toMatchObject({ entityId: 'WG-DAILY-01', before: { code: 'WG-DAILY-01', name: 'General', nameHi: null }, after: { code: 'WG-DAILY-01', name: 'Operator', nameHi: null } });
    expect(findLeaks(row, { keys: /amount|rate|wage$/i, values: [...BASE_SENTINELS, '760.5', '800.25', '120.75'] })).toEqual([]);
  });

  it('refuses a blank or too-long name and an unknown code', async () => {
    await expect(updateWageTypeDetails('WG-DAILY-01', { name: '   ' })).rejects.toThrow('Name is required.');
    await expect(updateWageTypeDetails('WG-DAILY-01', { name: 'x'.repeat(81) })).rejects.toThrow(/too long/);
    await expect(updateWageTypeDetails('WG-NOPE-01', { name: 'X' })).rejects.toThrow(/not found/);
    expect(state.auditRows).toEqual([]);
  });
});

describe('listWageRateHistory', () => {
  it('lists every rate, newest first per code, marked scheduled / in force / past as of today — exact amounts', async () => {
    const h = await listWageRateHistory('2026-10-19');
    expect(h.map((r) => [r.code, r.effectiveFrom.toISOString().slice(0, 10), r.amount, r.status])).toEqual([
      ['WG-DAILY-01', '2026-12-01', 800.25, 'SCHEDULED'],
      ['WG-DAILY-01', '2026-06-01', 760.5, 'IN_FORCE'],
      ['WG-DAILY-01', '2026-01-01', 731.19, 'PAST'],
      ['WG-MONTHLY-01', '2026-01-01', 18734.56, 'IN_FORCE'],
    ]);
    expect(h[1].otRatePerHour).toBe(120.75);
  });

  it('a rate starting today is the one in force', async () => {
    const h = await listWageRateHistory('2026-06-01');
    expect(h.filter((r) => r.code === 'WG-DAILY-01').map((r) => r.status)).toEqual(['SCHEDULED', 'IN_FORCE', 'PAST']);
  });

  it('a renamed code reads under its new name across its whole history', async () => {
    await updateWageTypeDetails('WG-DAILY-01', { name: 'Operator' });
    expect((await listWageRateHistory('2026-10-19')).filter((r) => r.code === 'WG-DAILY-01').map((r) => r.name)).toEqual(['Operator', 'Operator', 'Operator']);
    expect((await listWageTypes()).find((t) => t.code === 'WG-DAILY-01')!.name).toBe('Operator');
  });
});

describe.each(MIS_ROLES.filter((r) => r !== 'OWNER'))('%s', (role) => {
  it('cannot rename a wage type or read its rate history (wages.read)', async () => {
    getMisRole.mockResolvedValue(role);
    await expect(updateWageTypeDetails('WG-DAILY-01', { name: 'X' })).rejects.toThrow(/Not permitted: wages\.read/);
    await expect(listWageRateHistory('2026-10-19')).rejects.toThrow(/Not permitted: wages\.read/);
    expect(state.wageTypes.every((r) => r.name !== 'X')).toBe(true);
  });
});
