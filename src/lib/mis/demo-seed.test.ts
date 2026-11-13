import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_SCRIPT,
  buildAttendanceDay,
  demoLabel,
  factoryInstant,
  isDemoTagged,
  isSundayKey,
  lastDateKeys,
  pickSampleEmployees,
  runningBalances,
  type EmployeeLite,
} from './demo-seed';

const IST = 'Asia/Kolkata';

describe('demo-seed helpers', () => {
  it('tags', () => {
    expect(demoLabel('x')).toBe('[DEMO] x');
    expect(isDemoTagged('[DEMO] x')).toBe(true);
    expect(isDemoTagged('DEMO-CUS-001')).toBe(true);
    expect(isDemoTagged('Real Co')).toBe(false);
    expect(isDemoTagged(null)).toBe(false);
  });

  it('factoryInstant reads the factory wall clock (IST = UTC+5:30)', () => {
    expect(factoryInstant('2026-11-12', '09:00', IST).toISOString()).toBe('2026-11-12T03:30:00.000Z');
    expect(factoryInstant('2026-11-12', '00:10', IST).toISOString()).toBe('2026-11-11T18:40:00.000Z');
  });

  it('lastDateKeys ends yesterday, oldest first', () => {
    expect(lastDateKeys('2026-11-13', 7)).toEqual([
      '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12',
    ]);
    expect(isSundayKey('2026-11-08')).toBe(true);
    expect(isSundayKey('2026-11-09')).toBe(false);
  });

  it('night shift clock-out crosses midnight but belongs to the start day', () => {
    const d = buildAttendanceDay({ dateKey: '2026-11-10', shiftStart: '20:00', shiftEnd: '05:00', scenario: 'NORMAL', zone: IST });
    expect(d.clockIn.toISOString()).toBe('2026-11-10T14:26:00.000Z'); // 19:56 IST
    expect(d.clockOut?.toISOString()).toBe('2026-11-10T23:36:00.000Z'); // 05:06 IST on the 11th
    expect(d.status).toBe('PRESENT');
  });

  it('late, half-day, missed-out and overtime cases', () => {
    const late = buildAttendanceDay({ dateKey: '2026-11-10', shiftStart: '09:00', shiftEnd: '18:00', scenario: 'LATE', zone: IST });
    expect(late.lateMinutes).toBe(35);
    expect(late.clockIn.toISOString()).toBe('2026-11-10T04:05:00.000Z');
    const half = buildAttendanceDay({ dateKey: '2026-11-10', shiftStart: '09:00', shiftEnd: '18:00', scenario: 'HALF_DAY', zone: IST });
    expect(half.status).toBe('HALF_DAY');
    expect(half.clockOut).not.toBeNull();
    const missed = buildAttendanceDay({ dateKey: '2026-11-10', shiftStart: '09:00', shiftEnd: '18:00', scenario: 'MISSED_OUT', zone: IST });
    expect(missed.clockOut).toBeNull();
    const ot = buildAttendanceDay({ dateKey: '2026-11-10', shiftStart: '20:00', shiftEnd: '05:00', scenario: 'OVERTIME', zone: IST });
    expect(ot.otMinutes).toBe(150);
    expect(ot.clockOut?.toISOString()).toBe('2026-11-11T02:00:00.000Z'); // 07:30 IST
  });

  it('every slot scripts at least one non-normal case and the night slot has a cross-midnight shift', () => {
    for (const script of Object.values(ATTENDANCE_SCRIPT)) expect(script.some((s) => s !== 'NORMAL')).toBe(true);
    expect(ATTENDANCE_SCRIPT.DAY).toContain('LATE');
    expect(ATTENDANCE_SCRIPT.DAY).toContain('HALF_DAY');
    const all = Object.values(ATTENDANCE_SCRIPT).flat();
    expect(all).toContain('MISSED_OUT');
  });

  it('pickSampleEmployees: EMP101+, shift match, no wage code, prefers no login, lowest code', () => {
    const e = (code: string, shift: string, extra: Partial<EmployeeLite> = {}): EmployeeLite => ({
      id: code, employeeCode: code, defaultShiftId: shift, wageTypeCode: null, userProfileId: null, isActive: true, deletedAt: null, ...extra,
    });
    const picked = pickSampleEmployees(
      [
        e('EMP-001', 'g'), e('EMP100', 'g'), e('EMP101', 'g', { userProfileId: 'u' }), e('EMP105', 'g'),
        e('EMP103', 'g', { wageTypeCode: 'WG-X' }), e('EMP104', 'g', { isActive: false }), e('EMP131', 'n'),
      ],
      { DAY: undefined, NIGHT: 'n', GENERAL: 'g', LADIES: 'zz', HOUSEKEEPING: undefined },
    );
    expect(picked.GENERAL?.employeeCode).toBe('EMP105');
    expect(picked.NIGHT?.employeeCode).toBe('EMP131');
    expect(picked.LADIES).toBeUndefined();
  });

  it('runningBalances tracks each item separately', () => {
    expect(
      runningBalances([
        { itemId: 'a', change: 100 }, { itemId: 'b', change: 5 }, { itemId: 'a', change: -30.5 }, { itemId: 'a', change: 10 },
      ]),
    ).toEqual([100, 5, 69.5, 79.5]);
  });
});

import { planResume } from './demo-seed';

describe('planResume', () => {
  const names = ['1-masters', '7-attendance', '8-payroll-period'];
  const m = [
    { name: '1-masters', state: 'committed' as const, ids: { misShift: ['a'], misItem: ['b', 'c'] } },
    { name: '7-attendance', state: 'pending' as const, ids: { misAttendance: ['x', 'y'] } },
  ];
  it('skips verified committed, reruns untouched pending, runs missing', () => {
    const r = planResume(names, m, { '1-masters': { misShift: 1, misItem: 2 }, '7-attendance': { misAttendance: 0 } });
    expect(r.blockers).toEqual([]);
    expect(r.decisions.map((d) => d.action)).toEqual(['skip', 'rerun', 'run']);
  });
  it('blocks committed chunk with missing rows', () => {
    const r = planResume(names, m, { '1-masters': { misShift: 1, misItem: 1 }, '7-attendance': { misAttendance: 0 } });
    expect(r.blockers.join()).toContain('1-masters');
  });
  it('blocks partially present pending chunk', () => {
    const r = planResume(names, m, { '1-masters': { misShift: 1, misItem: 2 }, '7-attendance': { misAttendance: 1 } });
    expect(r.blockers.join()).toContain('partial');
  });
  it('blocks non-resume-safe pending chunk', () => {
    const r = planResume(['5-production'], [{ name: '5-production', state: 'pending', ids: { misJobPhase: ['p'] } }], { '5-production': { misJobPhase: 0 } });
    expect(r.blockers.join()).toContain('not resume-safe');
  });
});
