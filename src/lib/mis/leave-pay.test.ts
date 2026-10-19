import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEAVE_PAY,
  buildLeavePayView,
  isPaidLeaveDay,
  leavePayAsOf,
  monthEndKey,
  validateLeavePayChange,
  type LeavePayRuleRow,
} from './leave-pay';

const row = (id: string, leaveType: string, paid: boolean, effectiveFrom: string, createdAt: string, extra: Partial<LeavePayRuleRow> = {}): LeavePayRuleRow => ({
  id, leaveType, paid, effectiveFrom: new Date(effectiveFrom), createdAt: new Date(createdAt), ...extra,
});

describe('R2-102 leave-pay helpers', () => {
  it('defaults: EVERY type unpaid (payroll as before R2-102 until the Owner turns CL/SL/EL on)', () => {
    expect(DEFAULT_LEAVE_PAY).toEqual({ CL: false, SL: false, EL: false, LWP: false, OTHER: false });
    expect(leavePayAsOf([], '2026-01-31')).toEqual(DEFAULT_LEAVE_PAY);
  });

  it('the newest row on or before the day wins; a later row on the same day beats an earlier one; future rows are ignored', () => {
    const rows = [
      row('1', 'CL', false, '2026-01-10', '2026-01-10T05:00:00Z'),
      row('2', 'CL', true, '2026-01-10', '2026-01-10T09:00:00Z'),
      row('3', 'SL', true, '2026-02-01', '2026-02-01T05:00:00Z'),
      row('4', 'BOGUS', true, '2026-01-01', '2026-01-01T05:00:00Z'),
    ];
    expect(leavePayAsOf(rows, '2026-01-09')).toEqual(DEFAULT_LEAVE_PAY);
    expect(leavePayAsOf(rows, '2026-01-31')).toMatchObject({ CL: true, SL: false });
    expect(leavePayAsOf(rows.slice(0, 1), '2026-01-31').CL).toBe(false);
    expect(leavePayAsOf(rows, '2026-02-28')).toMatchObject({ CL: true, SL: true });
  });

  it('monthEndKey handles February and December', () => {
    expect(monthEndKey(2026, 2)).toBe('2026-02-28');
    expect(monthEndKey(2028, 2)).toBe('2028-02-29');
    expect(monthEndKey(2026, 12)).toBe('2026-12-31');
  });

  it('isPaidLeaveDay: the day must fall inside one of THIS employee’s leaves, of a paid type', () => {
    const leaves = [
      { employeeId: 'e1', date: new Date('2026-01-06'), endDate: new Date('2026-01-08'), leaveType: 'SL' },
      { employeeId: 'e1', date: new Date('2026-01-12'), endDate: null, leaveType: 'LWP' },
      { employeeId: 'e2', date: new Date('2026-01-14'), endDate: null, leaveType: 'CL' },
    ];
    const core = { ...DEFAULT_LEAVE_PAY, CL: true, SL: true, EL: true };
    const paid = (key: string, emp = 'e1') => isPaidLeaveDay(leaves, emp, new Date(key), core);
    expect(isPaidLeaveDay(leaves, 'e1', new Date('2026-01-06'), DEFAULT_LEAVE_PAY)).toBe(false); // default: nothing paid
    expect([paid('2026-01-05'), paid('2026-01-06'), paid('2026-01-08'), paid('2026-01-09')]).toEqual([false, true, true, false]);
    expect(paid('2026-01-12')).toBe(false); // LWP
    expect(paid('2026-01-14')).toBe(false); // someone else's leave
    expect(paid('2026-01-14', 'e2')).toBe(true);
    expect(isPaidLeaveDay(leaves, 'e1', new Date('2026-01-12'), { ...core, LWP: true })).toBe(true);
  });

  it('validateLeavePayChange', () => {
    expect(validateLeavePayChange({ leaveType: 'CL', paid: false })).toBeNull();
    expect(validateLeavePayChange({ leaveType: 'CL', paid: true, reason: 'ok' })).toBeNull();
    expect(validateLeavePayChange({ leaveType: 'cl', paid: true })).toMatch(/CL, SL/);
    expect(validateLeavePayChange({ leaveType: 'CL', paid: 'true' })).toMatch(/Paid or Unpaid/);
    expect(validateLeavePayChange({ leaveType: 'CL', paid: true, reason: 5 })).toMatch(/text/);
    expect(validateLeavePayChange({ leaveType: 'CL', paid: true, reason: 'x'.repeat(201) })).toMatch(/200/);
  });

  it('buildLeavePayView: five types in order, history newest first, names resolved, unknown person reads as Owner', () => {
    const view = buildLeavePayView(
      [
        row('1', 'CL', true, '2026-01-10', '2026-01-10T05:00:00Z', { changedById: 'u1', reason: ' first ' }),
        row('2', 'LWP', true, '2026-01-11', '2026-01-11T05:00:00Z', { changedById: 'u9' }),
      ],
      { todayKey: '2026-01-20', names: new Map([['u1', 'Arjun']]) },
    );
    expect(view.types.map((t) => [t.leaveType, t.paid, t.isDefault, t.since])).toEqual([
      ['CL', true, false, '2026-01-10'],
      ['SL', false, true, null],
      ['EL', false, true, null],
      ['LWP', true, false, '2026-01-11'],
      ['OTHER', false, true, null],
    ]);
    expect(view.history.map((h) => [h.id, h.changedBy, h.reason])).toEqual([['2', 'Owner', null], ['1', 'Arjun', 'first']]);
    expect(view.setupPending).toBe(false);
  });
});
