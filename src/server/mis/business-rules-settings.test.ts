/**
 * R2-241 orphan shift keys hidden · R2-242 / R2-260 late-rule workers is an enum, validated on save.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const { getBusinessRules, updateBusinessRule } = await import('./business-rules');

const rule = (ruleKey: string, ruleValue: string, description: string | null = null) =>
  ({ id: `r-${ruleKey}`, ruleKey, ruleValue, valueType: 'string', label: ruleKey, description, effectiveFrom: new Date('2020-01-01'), updatedById: null });

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  state.rules.push(
    rule('shift.start_time', '09:00'),
    rule('shift.end_time', '18:00'),
    rule('attendance.late_rule_workers', 'ALL', 'deduct_ot or absent'),
  );
});

describe('R2-241 — orphan shift.start_time / shift.end_time', () => {
  it('are not listed in Settings, but their rows are still there', async () => {
    const keys = (await getBusinessRules()).map((r) => r.ruleKey);
    expect(keys).not.toContain('shift.start_time');
    expect(keys).not.toContain('shift.end_time');
    expect(state.rules.filter((r) => String(r.ruleKey).startsWith('shift.'))).toHaveLength(2);
  });
});

describe('R2-242 / R2-260 — attendance.late_rule_workers', () => {
  it('is described as ALL / DAILY / MONTHLY, whatever the stored row says', async () => {
    const row = (await getBusinessRules()).find((r) => r.ruleKey === 'attendance.late_rule_workers')!;
    expect(row.description).toMatch(/ALL, DAILY or MONTHLY/);
    expect(row.description).not.toMatch(/deduct_ot/);
  });

  it('refuses an unknown value on save instead of reading it as ALL later; accepts the three words (any case)', async () => {
    await expect(updateBusinessRule('attendance.late_rule_workers', 'deduct_ot')).rejects.toThrow(/ALL, DAILY or MONTHLY/);
    await expect(updateBusinessRule('attendance.late_rule_workers', 'absent')).rejects.toThrow(/ALL, DAILY or MONTHLY/);
    await expect(updateBusinessRule('attendance.late_rule_workers', 'DAILY')).resolves.toMatchObject({ ruleValue: 'DAILY' });
    await expect(updateBusinessRule('attendance.late_rule_workers', 'monthly')).resolves.toMatchObject({ ruleValue: 'monthly' });
  });
});
