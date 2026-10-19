import { describe, expect, it } from 'vitest';
import {
  countLeaveWorkingDays,
  expandDateRange,
  isLeaveType,
  leaveRangesOverlap,
  leaveTypeLabel,
  leaveWorkingDays,
  validateLeaveRange,
} from './leave';

describe('leave helpers (R2-101/102)', () => {
  it('expands an inclusive range and is empty when reversed', () => {
    expect(expandDateRange('2026-10-28', '2026-11-02')).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(expandDateRange('2026-10-05', '2026-10-04')).toEqual([]);
  });

  it('counts working days, skipping Sundays in a range', () => {
    // 2026-10-25 is a Sunday.
    expect(countLeaveWorkingDays('2026-10-23', '2026-10-27')).toBe(4);
    expect(leaveWorkingDays('2026-10-23', '2026-10-27')).not.toContain('2026-10-25');
  });

  it('a single day is always one day, even a Sunday', () => {
    expect(countLeaveWorkingDays('2026-10-25', null)).toBe(1);
    expect(countLeaveWorkingDays('2026-10-25', '2026-10-25')).toBe(1);
  });

  it('detects overlap, touching ends included', () => {
    expect(leaveRangesOverlap({ start: '2026-10-10', end: '2026-10-12' }, { start: '2026-10-12' })).toBe(true);
    expect(leaveRangesOverlap({ start: '2026-10-10', end: '2026-10-12' }, { start: '2026-10-13', end: null })).toBe(false);
    expect(leaveRangesOverlap({ start: '2026-10-10' }, { start: '2026-10-01', end: '2026-10-31' })).toBe(true);
  });

  it('validates a range', () => {
    expect(validateLeaveRange('2026-10-10', null)).toBeNull();
    expect(validateLeaveRange('2026-10-10', '2026-10-12')).toBeNull();
    expect(validateLeaveRange('2026-10-10', '2026-10-09')).toMatch(/before/);
    expect(validateLeaveRange('2026-01-01', '2026-12-31')).toMatch(/at most/);
    expect(validateLeaveRange('2026-10-24', '2026-10-25')).toBeNull(); // Sat + Sun still has a working day
  });

  it('knows its leave types', () => {
    for (const t of ['CL', 'SL', 'EL', 'LWP', 'OTHER']) expect(isLeaveType(t)).toBe(true);
    expect(isLeaveType('XX')).toBe(false);
    expect(leaveTypeLabel('LWP')).toMatch(/without pay/);
    expect(leaveTypeLabel(null)).toBe('Other');
  });
});
