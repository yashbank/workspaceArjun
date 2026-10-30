/** R2-241 (orphan shift keys hidden) and R2-242 (late-rule audience is an enum). */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const { getBusinessRules, updateBusinessRule } = await import('./business-rules');

const rule = (ruleKey: string, ruleValue: string, valueType = 'string') =>
  state.rules.push({ id: `r-${ruleKey}`, ruleKey, ruleValue, valueType, label: ruleKey, description: null, effectiveFrom: new Date('2020-01-01'), updatedById: null });

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('R2-241: shift.start_time / shift.end_time are never read, so the settings list hides them', () => {
  it('the rows stay in the table but are not listed', async () => {
    rule('shift.start_time', '09:00');
    rule('shift.end_time', '18:00');
    rule('attendance.late_rule_workers', 'ALL');
    const keys = (await getBusinessRules()).map((r) => r.ruleKey);
    expect(keys).not.toContain('shift.start_time');
    expect(keys).not.toContain('shift.end_time');
    expect(keys).toContain('attendance.late_rule_workers');
    expect(state.rules.some((r) => r.ruleKey === 'shift.start_time')).toBe(true);
  });
});

describe('R2-242: attendance.late_rule_workers accepts only ALL / DAILY / MONTHLY', () => {
  beforeEach(() => rule('attendance.late_rule_workers', 'ALL'));
  it('refuses free text in words', async () => {
    await expect(updateBusinessRule('attendance.late_rule_workers', 'daily workers')).rejects.toThrow(/ALL, DAILY, MONTHLY/);
  });
  it('accepts a listed value', async () => {
    await expect(updateBusinessRule('attendance.late_rule_workers', 'DAILY')).resolves.toMatchObject({ ruleValue: 'DAILY' });
  });
});
