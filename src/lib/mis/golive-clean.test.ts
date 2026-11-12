import { describe, expect, it } from 'vitest';
import { departmentCode, fixTypos, mapSheetRole, matchKey, normaliseText, resolveShiftName } from './golive-clean';

const SHIFTS = ['Day Shift', 'Night Shift', 'General Shift', 'General Ladies', 'House Keeping'];

describe('golive-clean', () => {
  it('collapses and trims spaces', () => {
    expect(normaliseText('  Girdharilal  Dhard ')).toBe('Girdharilal Dhard');
    expect(normaliseText(null)).toBe('');
    expect(matchKey('Pinned Line ')).toBe(matchKey('pinned  line'));
  });
  it('resolves client shift names to real shifts', () => {
    expect(resolveShiftName('General', SHIFTS)).toBe('General Shift');
    expect(resolveShiftName('Day', SHIFTS)).toBe('Day Shift');
    expect(resolveShiftName('House keeping', SHIFTS)).toBe('House Keeping');
    expect(resolveShiftName('night shift', SHIFTS)).toBe('Night Shift');
    expect(resolveShiftName('General Ladies', SHIFTS)).toBe('General Ladies');
    expect(resolveShiftName('Evening', SHIFTS)).toBeNull();
    expect(resolveShiftName('', SHIFTS)).toBeNull();
  });
  it('maps sheet roles', () => {
    expect(mapSheetRole('Production Manager')).toBe('ADMIN');
    expect(mapSheetRole('supervisior')).toBe('SUPERVISOR');
    expect(mapSheetRole('Supervisior')).toBe('SUPERVISOR');
    expect(mapSheetRole('super Attendance')).toBe('SUPER_ATTENDANCE_OPERATOR');
    expect(mapSheetRole('Store')).toBe('STORE_GUY');
    expect(mapSheetRole('QC')).toBe('QC');
    expect(mapSheetRole('Owner')).toBe('OWNER');
    expect(mapSheetRole('Janitor')).toBeNull();
  });
  it('fixes designation typos', () => {
    expect(fixTypos('Production Supervisior')).toBe('Production Supervisor');
    expect(fixTypos('supervisior')).toBe('supervisor');
    expect(fixTypos('Genral Manager')).toBe('General Manager');
  });
  it('builds department codes', () => {
    expect(departmentCode('Notebook production')).toBe('NOTEBOOK_PRODUCTION');
    expect(departmentCode('Pinned Line ')).toBe('PINNED_LINE');
  });
});
