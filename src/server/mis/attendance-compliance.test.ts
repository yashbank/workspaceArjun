import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NOTIFICATION_TYPES } from '@/lib/mis/notification-copy';
import {
  canSeeComplianceFlags, complianceFlagsFor, exceedsDailyLimit, exceedsQuarterlyOtLimit, exceedsWeeklyLimit,
  MAX_DAILY_WORK_MINUTES, OT_NOTIFY_MIN_MINUTES, quarterBounds, shouldNotifyOvertime, weekStartKey,
} from '@/server/mis/attendance-payroll-rules';

const { notifyRoles, findMany } = vi.hoisted(() => ({ notifyRoles: vi.fn(), findMany: vi.fn() }));
vi.mock('@/server/mis/notifications', () => ({ notifyRoles }));
vi.mock('@/server/db', () => ({ db: { misEmployee: { findMany } } }));
vi.mock('@/server/mis/business-rules', () => ({ getLunchBreakMinutes: vi.fn(async () => 30) }));

import { notifyLongOvertime } from '@/server/mis/attendance-compliance';

describe('R2-217 pure compliance helpers', () => {
  it('daily: 9h is fine, 9h01 breaches', () => {
    expect(exceedsDailyLimit(MAX_DAILY_WORK_MINUTES)).toBe(false);
    expect(exceedsDailyLimit(MAX_DAILY_WORK_MINUTES + 1)).toBe(true);
  });
  it('weekly: 48h is fine, 48h01 breaches', () => {
    expect(exceedsWeeklyLimit(48 * 60)).toBe(false);
    expect(exceedsWeeklyLimit(48 * 60 + 1)).toBe(true);
  });
  it('quarterly OT: 75h is fine, 75h01 breaches', () => {
    expect(exceedsQuarterlyOtLimit(75 * 60)).toBe(false);
    expect(exceedsQuarterlyOtLimit(75 * 60 + 1)).toBe(true);
  });
  it('weeks start on Monday and quarters are calendar quarters', () => {
    expect(weekStartKey('2026-10-04')).toBe('2026-09-28'); // a Sunday
    expect(weekStartKey('2026-10-05')).toBe('2026-10-05');
    expect(quarterBounds('2026-11-15')).toEqual({ start: '2026-10-01', end: '2026-12-31' });
  });
  it('flags days, weeks and quarter OT, with no money in them', () => {
    const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((dateKey) => ({ dateKey, workedMinutes: 9 * 60 + 30, otMinutes: 90 }));
    const flags = complianceFlagsFor(week, '2026-10');
    expect(flags).toEqual(['Exceeds 9h/day (6 days)', 'Exceeds 48h/week (1 week)']);
    const heavy = [{ dateKey: '2026-10-02', workedMinutes: 480, otMinutes: 76 * 60 }];
    expect(complianceFlagsFor(heavy, '2026-10')).toEqual(['Exceeds 75h OT/quarter']);
    expect(complianceFlagsFor(heavy, '2027-01')).toEqual([]);
    expect(flags.join(' ')).not.toMatch(/₹|\$|wage|salary/i);
  });
  it('only Owner, Admin and Supervisor see flags', () => {
    expect(['OWNER', 'ADMIN', 'SUPERVISOR'].every(canSeeComplianceFlags)).toBe(true);
    expect(['QC', 'ATTENDANCE_OPERATOR', 'WORKER', 'STORE_GUY', null].some((r) => canSeeComplianceFlags(r))).toBe(false);
  });
});

describe('R2-212 supervisor overtime notification', () => {
  beforeEach(() => { notifyRoles.mockReset(); findMany.mockReset(); findMany.mockResolvedValue([{ id: 'e1', name: 'Ramesh', employeeCode: 'BPP-014' }]); });

  it('threshold is inclusive', () => {
    expect(shouldNotifyOvertime(OT_NOTIFY_MIN_MINUTES - 1)).toBe(false);
    expect(shouldNotifyOvertime(OT_NOTIFY_MIN_MINUTES)).toBe(true);
    expect(shouldNotifyOvertime(null)).toBe(false);
  });
  it('notifies Supervisors with minutes only, no wage fields', async () => {
    await notifyLongOvertime([{ employeeId: 'e1', workDate: '2026-10-05', otMinutes: 45 }, { employeeId: 'e1', workDate: '2026-10-06', otMinutes: 10 }]);
    expect(notifyRoles).toHaveBeenCalledTimes(1);
    const [roles, type, payload] = notifyRoles.mock.calls[0];
    expect(roles).toEqual(['SUPERVISOR']);
    expect(type).toBe(NOTIFICATION_TYPES.longOvertime);
    expect(payload).toEqual({ employeeId: 'e1', employeeName: 'Ramesh', employeeCode: 'BPP-014', workDate: '2026-10-05', otMinutes: 45 });
    expect(JSON.stringify(payload)).not.toMatch(/wage|salary|pay/i);
  });
  it('does nothing (no query) when no day crosses the threshold', async () => {
    await notifyLongOvertime([{ employeeId: 'e1', workDate: '2026-10-05', otMinutes: 5 }]);
    expect(findMany).not.toHaveBeenCalled();
    expect(notifyRoles).not.toHaveBeenCalled();
  });
});
