/** R8 review: a hidden rule key is not writable through the generic rule editors; ui.theme belongs to saveOrgTheme. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const { scheduleBusinessRule, updateBusinessRule } = await import('./business-rules');

const rule = (ruleKey: string, ruleValue: string) =>
  ({ id: `r-${ruleKey}`, ruleKey, ruleValue, valueType: 'json', label: ruleKey, description: null, effectiveFrom: new Date('2020-01-01'), updatedById: null });
const THEME = '{"paletteId":"teal","fontPairId":"system"}';
// Reading the timezone seeds its own default row, so only the hidden rows are compared.
const hiddenRows = () => JSON.stringify(state.rules.filter((r) => r.ruleKey === 'ui.theme' || r.ruleKey === 'shift.start_time'));

beforeEach(() => {
  seedWorld();
  state.rules.push(rule('ui.theme', THEME), rule('shift.start_time', '09:00'));
});

describe.each(['ADMIN', 'OWNER'])('%s', (role) => {
  it.each(['ui.theme', 'shift.start_time'])('updateBusinessRule refuses %s and writes nothing', async (key) => {
    getMisRole.mockResolvedValue(role);
    const before = hiddenRows();
    await expect(updateBusinessRule(key, 'anything')).rejects.toThrow(/not edited here/);
    expect(hiddenRows()).toBe(before);
  });
});

it('scheduleBusinessRule refuses it too, even for the Owner', async () => {
  getMisRole.mockResolvedValue('OWNER');
  const before = hiddenRows();
  await expect(scheduleBusinessRule({ ruleKey: 'ui.theme', ruleValue: 'anything', effectiveFrom: '2099-01-01', reason: 'because' })).rejects.toThrow(/not edited here/);
  expect(hiddenRows()).toBe(before);
});
