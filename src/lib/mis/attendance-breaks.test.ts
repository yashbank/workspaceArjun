import { describe, expect, it } from 'vitest';
import { guessBreakKind, planBreakPunch, toBreakShapes, totalBreakMinutes, unpaidTotalBreakMinutes } from './attendance-breaks';

const t = (hhmm: string) => new Date(`2026-09-15T${hhmm}:00Z`);
const row = (o: string, i: string | null) => ({ outAt: t(o), inAt: i ? t(i) : null });

describe('totalBreakMinutes', () => {
  it('sums several rows', () => expect(totalBreakMinutes([row('06:00', '06:15'), row('08:00', '08:30')])).toBe(45));
  it('counts overlapping rows once', () => expect(totalBreakMinutes([row('06:00', '06:30'), row('06:20', '06:40')])).toBe(40));
  it('ignores open rows', () => expect(totalBreakMinutes([row('06:00', '06:15'), row('08:00', null)])).toBe(15));
  it('ignores zero and inverted rows', () => expect(totalBreakMinutes([row('06:00', '06:00'), row('07:00', '06:50')])).toBe(0));
  it('falls back to legacy when no rows', () => {
    expect(totalBreakMinutes([], { breakOut: t('06:00'), breakIn: t('06:40') })).toBe(40);
    expect(totalBreakMinutes(null, { breakOut: t('06:00'), breakIn: null })).toBe(0);
    expect(totalBreakMinutes([], null)).toBe(0);
  });
  it('ignores legacy when rows exist', () => expect(totalBreakMinutes([row('06:00', '06:10')], { breakOut: t('01:00'), breakIn: t('02:00') })).toBe(10));
});

describe('unpaidTotalBreakMinutes', () => {
  it('subtracts the paid allowance once', () => expect(unpaidTotalBreakMinutes([row('06:00', '06:20'), row('08:00', '08:25')], null, 30)).toBe(15));
  it('never negative', () => expect(unpaidTotalBreakMinutes([row('06:00', '06:10')], null, 30)).toBe(0));
});

describe('guessBreakKind / toBreakShapes', () => {
  it('guesses by factory time of day', () => {
    expect(guessBreakKind(new Date('2026-09-15T12:00:00Z'), 'UTC')).toBe('MEAL');
    expect(guessBreakKind(new Date('2026-09-15T10:30:00Z'), 'UTC')).toBe('TEA');
    expect(guessBreakKind(new Date('2026-09-15T03:00:00Z'), 'UTC')).toBe('OTHER');
  });
  it('returns plain sorted shapes', () => {
    const s = toBreakShapes([{ kind: 'TEA', ...row('08:00', null) }, { kind: 'MEAL', ...row('06:00', '06:30') }]);
    expect(s).toEqual([
      { kind: 'MEAL', outAt: '2026-09-15T06:00:00.000Z', inAt: '2026-09-15T06:30:00.000Z', minutes: 30 },
      { kind: 'TEA', outAt: '2026-09-15T08:00:00.000Z', inAt: null, minutes: 0 },
    ]);
  });
});

describe('planBreakPunch', () => {
  const day = (o: Partial<Parameters<typeof planBreakPunch>[1]> = {}) => ({ clockIn: t('01:00'), clockOut: null, breakOutAt: null, breakInAt: null, breaks: [], ...o });
  it('second break after a closed first one is allowed (R2-216)', () => {
    const d = day({ breakOutAt: t('06:00'), breakInAt: t('06:30'), breaks: [{ id: 'a', outAt: t('06:00'), inAt: t('06:30') }] });
    const p = planBreakPunch('OUT', d, t('08:00'));
    expect(p).toMatchObject({ op: 'OPEN', legacy: {} });
  });
  it('first OUT mirrors legacy breakOutAt', () => expect(planBreakPunch('OUT', day(), t('06:00'))).toMatchObject({ op: 'OPEN', legacy: { breakOutAt: t('06:00') } }));
  it('OUT while open is refused', () => expect(planBreakPunch('OUT', day({ breaks: [{ id: 'a', outAt: t('06:00'), inAt: null }] }), t('07:00'))).toEqual({ skip: 'Break already started' }));
  it('IN with nothing open is refused', () => expect(planBreakPunch('IN', day(), t('07:00'))).toEqual({ skip: 'Break not started' }));
  it('IN closes the open row', () => expect(planBreakPunch('IN', day({ breaks: [{ id: 'a', outAt: t('06:00'), inAt: null }] }), t('06:20'))).toMatchObject({ op: 'CLOSE', closeId: 'a' }));
  it('legacy-only closed break is backfilled on the next OUT', () => {
    const p = planBreakPunch('OUT', day({ breakOutAt: t('06:00'), breakInAt: t('06:30') }), t('08:00'));
    expect(p).toMatchObject({ op: 'OPEN', backfillLegacy: { outAt: t('06:00') } });
  });
  it('refuses before clock-in / after clock-out / backwards', () => {
    expect(planBreakPunch('OUT', day({ clockIn: null }), t('06:00'))).toEqual({ skip: 'Not clocked in' });
    expect(planBreakPunch('OUT', day({ clockOut: t('10:00') }), t('06:00'))).toEqual({ skip: 'Already clocked out' });
    expect(planBreakPunch('OUT', day(), t('00:30'))).toEqual({ skip: 'Before the clock-in' });
    expect(planBreakPunch('IN', day({ breaks: [{ id: 'a', outAt: t('06:00'), inAt: null }] }), t('05:00'))).toEqual({ skip: 'Before the break-out' });
  });
});
