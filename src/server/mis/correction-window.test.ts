/** R2-227: Admin/Owner edit window comes from `attendance.edit_window_days_admin`, everyone else from ATTENDANCE_CORRECTION_DAYS. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rules = new Map<string, string>();
vi.mock('@/server/db', () => ({
  db: {
    misBusinessRule: {
      findFirst: async ({ where }: { where: { ruleKey: string } }) => (rules.has(where.ruleKey) ? { ruleValue: rules.get(where.ruleKey) } : null),
    },
  },
}));

describe('getCorrectionWindowDays', () => {
  beforeEach(() => rules.clear());

  it('Admin and Owner use the admin window (80 days), not the 3-day default', async () => {
    rules.set('attendance.edit_window_days_admin', '80');
    const { getCorrectionWindowDays } = await import('./business-rules');
    expect(await getCorrectionWindowDays('ADMIN')).toBe(80);
    expect(await getCorrectionWindowDays('OWNER')).toBe(80);
  });

  it('other roles keep the general window, defaulting to 3', async () => {
    rules.set('attendance.edit_window_days_admin', '80');
    const { getCorrectionWindowDays } = await import('./business-rules');
    expect(await getCorrectionWindowDays('ATTENDANCE_OPERATOR')).toBe(3);
    expect(await getCorrectionWindowDays()).toBe(3);
    rules.set('ATTENDANCE_CORRECTION_DAYS', '7');
    expect(await getCorrectionWindowDays('SUPERVISOR')).toBe(7);
  });

  it('an unset or invalid admin window falls back to the general window', async () => {
    const { getCorrectionWindowDays } = await import('./business-rules');
    expect(await getCorrectionWindowDays('ADMIN')).toBe(3);
    rules.set('attendance.edit_window_days_admin', 'abc');
    rules.set('ATTENDANCE_CORRECTION_DAYS', '5');
    expect(await getCorrectionWindowDays('ADMIN')).toBe(5);
  });
});
