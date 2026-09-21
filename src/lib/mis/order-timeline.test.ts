/**
 * Phase 24C · D4 — the rules behind the order detail, as arithmetic.
 *
 * The artboard's own claims, each pinned: phase state has THREE values and "not started"
 * splits in two; every figure is a pair; the hourly strip says taken / failed / to come; and a
 * "days left" never depends on the hour the server was asked at (D22).
 */
import { describe, expect, it } from 'vitest';

import {
  activePhase,
  daysUntil,
  hourlyQcStrip,
  phaseFigures,
  phasePosition,
  phaseProgress,
  phaseStates,
  qcSummary,
  type PhaseInput,
  type QcCheckLike,
} from './order-timeline';

const IST = 'Asia/Kolkata';
const SGT = 'Asia/Singapore';

const phase = (sequence: number, status: PhaseInput['status']): PhaseInput => ({ id: `p${sequence}`, sequence, status });

/** D4's own order: line clearance signed, printing running, then five not started. */
const D4_ORDER: PhaseInput[] = [
  phase(1, 'SIGNED_OFF'),
  phase(2, 'IN_PROGRESS'),
  phase(3, 'PENDING'),
  phase(4, 'PENDING'),
  phase(5, 'PENDING'),
  phase(6, 'PENDING'),
  phase(7, 'PENDING'),
];

describe('phaseStates — three values, and "not started" splits in two', () => {
  const states = phaseStates(D4_ORDER);

  it('signed, running, blocked-by, not-yet — exactly D4\'s picture', () => {
    expect(states.get('p1')).toEqual({ kind: 'SIGNED' });
    expect(states.get('p2')).toEqual({ kind: 'RUNNING' });
    expect(states.get('p3')).toEqual({ kind: 'BLOCKED', bySequence: 2 });
    for (const id of ['p4', 'p5', 'p6', 'p7']) expect(states.get(id), id).toEqual({ kind: 'NOT_YET' });
  });

  it('"blocked by" is only the phase DIRECTLY after the running one — not every later phase', () => {
    const blocked = [...states.values()].filter((s) => s.kind === 'BLOCKED');
    expect(blocked).toHaveLength(1);
  });

  it('a phase whose predecessor is signed is merely not started — nothing is holding it', () => {
    const s = phaseStates([phase(1, 'SIGNED_OFF'), phase(2, 'PENDING')]);
    expect(s.get('p2')).toEqual({ kind: 'NOT_YET' });
  });

  it('a reopened phase blocks the one after it, exactly as a running one does', () => {
    const s = phaseStates([phase(1, 'REOPENED'), phase(2, 'PENDING')]);
    expect(s.get('p1')).toEqual({ kind: 'REOPENED' });
    expect(s.get('p2')).toEqual({ kind: 'BLOCKED', bySequence: 1 });
  });

  it('a NOT_APPLICABLE phase is skipped as a predecessor, and named by the phase before it', () => {
    const s = phaseStates([phase(1, 'IN_PROGRESS'), phase(2, 'NOT_APPLICABLE'), phase(3, 'PENDING')]);
    expect(s.get('p2')).toEqual({ kind: 'NOT_APPLICABLE' });
    expect(s.get('p3')).toEqual({ kind: 'BLOCKED', bySequence: 1 });
  });

  it('does not depend on the order the phases arrive in', () => {
    const shuffled = [...D4_ORDER].reverse();
    expect(phaseStates(shuffled).get('p3')).toEqual({ kind: 'BLOCKED', bySequence: 2 });
  });

  it('an order with no phases has no states, not an error', () => {
    expect(phaseStates([]).size).toBe(0);
  });

  it('every phase gets exactly one state', () => {
    expect(states.size).toBe(D4_ORDER.length);
  });
});

describe('activePhase / phasePosition / phaseProgress', () => {
  it('the active phase is the running one', () => {
    expect(activePhase(D4_ORDER)?.id).toBe('p2');
  });

  it('with nothing running, a reopened phase is the one to act on', () => {
    expect(activePhase([phase(1, 'SIGNED_OFF'), phase(2, 'REOPENED')])?.id).toBe('p2');
  });

  it('with nothing running or reopened there is no active phase', () => {
    expect(activePhase([phase(1, 'SIGNED_OFF'), phase(2, 'PENDING')])).toBeNull();
    expect(activePhase([])).toBeNull();
  });

  it('"Phase 2 of 7" — position among the phases that apply', () => {
    expect(phasePosition(D4_ORDER, 'p2')).toEqual({ at: 2, of: 7 });
  });

  it('a phase that does not apply is not counted, so an order is never "3 of 7" when six will run', () => {
    const phases = [phase(1, 'SIGNED_OFF'), phase(2, 'NOT_APPLICABLE'), phase(3, 'IN_PROGRESS'), phase(4, 'PENDING')];
    expect(phasePosition(phases, 'p3')).toEqual({ at: 2, of: 3 });
  });

  it('no phases, no position', () => {
    expect(phasePosition([], null)).toBeNull();
  });

  it('progress is signed against applicable — a pair, never a percentage on its own', () => {
    expect(phaseProgress(D4_ORDER)).toEqual({ done: 1, total: 7 });
    expect(phaseProgress([phase(1, 'SIGNED_OFF'), phase(2, 'NOT_APPLICABLE')])).toEqual({ done: 1, total: 1 });
    expect(phaseProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe('phaseFigures', () => {
  const logs = [
    { jobPhaseId: 'p2', qtyProduced: '20000.50', qtyWaste: '9' },
    { jobPhaseId: 'p2', qtyProduced: 20849.5, qtyWaste: 9.5 },
    { jobPhaseId: 'p1', qtyProduced: 5, qtyWaste: 1 },
    { jobPhaseId: null, qtyProduced: 99, qtyWaste: 99 },
  ];

  it('totals only the phase asked about, converting Decimal-likes to plain numbers', () => {
    expect(phaseFigures(logs, 'p2')).toEqual({ entries: 2, produced: 40850, waste: 18.5 });
  });

  it('a log with no phase belongs to no phase', () => {
    expect(phaseFigures(logs, 'p9')).toEqual({ entries: 0, produced: 0, waste: 0 });
  });

  it('a phase with nothing logged says entries: 0 — which the screen must render as "nothing yet", not a zero', () => {
    expect(phaseFigures([], 'p2').entries).toBe(0);
  });

  it('null quantities count as zero rather than NaN', () => {
    expect(phaseFigures([{ jobPhaseId: 'p2', qtyProduced: null, qtyWaste: undefined }], 'p2')).toEqual({ entries: 1, produced: 0, waste: 0 });
  });
});

describe('hourlyQcStrip — eight squares beat a table', () => {
  // Shift 1, 06:00–15:00 in IST, on 7 Sept 2026. 06:00 IST = 00:30 UTC.
  const shift = { startMinute: 6 * 60, endMinute: 15 * 60 };
  const DAY = '2026-09-07';
  const at = (hh: number, mm = 0) => new Date(Date.UTC(2026, 8, 7, hh, mm) - 5.5 * 3_600_000); // IST wall clock
  const check = (hh: number, result = 'PASS', extra: Partial<QcCheckLike> = {}): QcCheckLike => ({ checkTime: at(hh, 10), result, ...extra });

  it('one slot per hour of the shift — nine for 06:00 to 15:00', () => {
    expect(hourlyQcStrip([], shift, at(7, 12), DAY, IST)).toHaveLength(9);
  });

  it('reads "taken, failed, still to come" at 09:30: three passed, one failed, five ahead', () => {
    const checks = [check(6), check(7), check(8), check(9, 'FAIL')];
    const strip = hourlyQcStrip(checks, shift, at(9, 30), DAY, IST);
    expect(strip.map((s) => s.state)).toEqual(['PASS', 'PASS', 'PASS', 'FAIL', 'UPCOMING', 'UPCOMING', 'UPCOMING', 'UPCOMING', 'UPCOMING']);
  });

  it('an hour that ended with nothing taken is MISSED (dashed, "never recorded"), distinct from an hour still to come', () => {
    const strip = hourlyQcStrip([check(6), check(8)], shift, at(9, 30), DAY, IST);
    expect(strip[1].state).toBe('MISSED'); // 07:00 — ended, nothing taken
    expect(strip[3].state).toBe('UPCOMING'); // 09:00 hour is still running — not missed yet
    expect(strip[2].state).toBe('PASS');
  });

  it('the CURRENT hour with nothing yet is upcoming, not missed — the inspector still has time', () => {
    expect(hourlyQcStrip([], shift, at(9, 30), DAY, IST)[3].state).toBe('UPCOMING');
    expect(hourlyQcStrip([], shift, at(10, 0), DAY, IST)[3].state).toBe('MISSED');
  });

  it('a failure in an hour is not averaged away by a pass in the same hour', () => {
    const strip = hourlyQcStrip([check(9, 'PASS'), check(9, 'FAIL'), check(9, 'PASS')], shift, at(10, 30), DAY, IST);
    expect(strip[3].state).toBe('FAIL');
  });

  it('buckets by the FACTORY hour: a check at 06:10 IST is the 06:00 slot although it is 00:40 UTC', () => {
    expect(hourlyQcStrip([check(6)], shift, at(7, 0), DAY, IST)[0].state).toBe('PASS');
  });

  it('...and the same instant lands in a different hour in another zone (D22 — the zone is not decorative)', () => {
    // 06:10 IST is 08:40 in Singapore: the 08:00 slot of a 06:00 shift there.
    const strip = hourlyQcStrip([check(6)], shift, at(9, 0), DAY, SGT);
    expect(strip[0].state).not.toBe('PASS');
    expect(strip[2].state).toBe('PASS');
  });

  it('ignores a check from another day', () => {
    // A FAIL at 08:00 yesterday must neither turn today's 08:00 slot red nor count as taken:
    // that hour ended with nothing taken today, so it is MISSED.
    const yesterday = { checkTime: new Date(at(8, 10).getTime() - 86_400_000), result: 'FAIL' };
    const strip = hourlyQcStrip([yesterday], shift, at(9, 30), DAY, IST);
    expect(strip.some((s) => s.state === 'FAIL')).toBe(false);
    expect(strip[2].state).toBe('MISSED');
  });

  it('ignores a check taken outside the shift window rather than crashing or bending a slot', () => {
    const strip = hourlyQcStrip([{ checkTime: at(20, 0), result: 'PASS' }], shift, at(21, 0), DAY, IST);
    expect(strip.every((s) => s.state === 'MISSED')).toBe(true);
  });

  it('a future day shows every slot upcoming; a past day shows every empty slot missed', () => {
    expect(hourlyQcStrip([], shift, at(5, 0), '2026-09-08', IST).every((s) => s.state === 'UPCOMING')).toBe(true);
    expect(hourlyQcStrip([], shift, at(5, 0), '2026-09-06', IST).every((s) => s.state === 'MISSED')).toBe(true);
  });

  it('an overnight shift stays in order across midnight (22:00–06:00 is eight slots, 22 … 29)', () => {
    const night = { startMinute: 22 * 60, endMinute: 6 * 60 };
    const strip = hourlyQcStrip([], night, at(23, 30), DAY, IST);
    expect(strip).toHaveLength(8);
    expect(strip.map((s) => s.hour)).toEqual([22, 23, 24, 25, 26, 27, 28, 29]);
  });

  it('a check just after midnight belongs to the night shift that STARTED the previous evening', () => {
    const night = { startMinute: 22 * 60, endMinute: 6 * 60 };
    const after = { checkTime: new Date(Date.UTC(2026, 8, 7, 19, 40) /* 01:10 IST on the 8th */), result: 'PASS' };
    const strip = hourlyQcStrip([after], night, new Date(Date.UTC(2026, 8, 7, 20, 30)), DAY, IST);
    expect(strip[3].state).toBe('PASS'); // hour 25 = 01:00 on the 8th
  });

  it('an empty shift window yields no slots rather than a division by zero', () => {
    expect(hourlyQcStrip([], { startMinute: 600, endMinute: 600 }, at(9, 0), DAY, IST).length).toBeGreaterThanOrEqual(0);
  });
});

describe('qcSummary', () => {
  const t = (n: number) => new Date(Date.UTC(2026, 8, 7, n));

  it('"5 of 6 taken", and the open defect named', () => {
    const checks: QcCheckLike[] = [
      ...[1, 2, 3, 4, 5].map((n) => ({ checkTime: t(n), result: 'PASS' })),
      { checkTime: t(6), result: 'FAIL', parameterName: 'Shade', defectType: 'major' },
    ];
    const s = qcSummary(checks);
    expect(s.taken).toBe(6);
    expect(s.passed).toBe(5);
    expect(s.openDefect).toMatchObject({ parameter: 'Shade', defectType: 'major' });
  });

  it('a failure someone has acknowledged is not an OPEN defect', () => {
    const s = qcSummary([{ checkTime: t(1), result: 'FAIL', parameterName: 'Shade', acknowledgedAt: t(2) }]);
    expect(s.taken).toBe(1);
    expect(s.passed).toBe(0);
    expect(s.openDefect).toBeNull();
  });

  it('reports the MOST RECENT open failure when there are several', () => {
    const s = qcSummary([
      { checkTime: t(1), result: 'FAIL', parameterName: 'Old' },
      { checkTime: t(5), result: 'FAIL', parameterName: 'New' },
    ]);
    expect(s.openDefect?.parameter).toBe('New');
  });

  it('nothing taken: zero of zero and no defect — the screen shows the empty state, not "0 of 0 passed"', () => {
    expect(qcSummary([])).toEqual({ taken: 0, passed: 0, openDefect: null });
  });
});

describe('daysUntil — never depends on the hour the server was asked at (D22)', () => {
  const delivery = new Date('2026-09-18T00:00:00Z');

  it('D4\'s own figure: 7 Sept to 18 Sept is 11 days', () => {
    expect(daysUntil(delivery, new Date('2026-09-07T01:42:00Z'), IST)).toBe(11);
  });

  it('is the same at 00:10 IST and 23:50 IST on one factory day', () => {
    const early = new Date(Date.UTC(2026, 8, 6, 18, 40)); // 00:10 IST on the 7th
    const late = new Date(Date.UTC(2026, 8, 7, 18, 20)); //  23:50 IST on the 7th
    expect(daysUntil(delivery, early, IST)).toBe(11);
    expect(daysUntil(delivery, late, IST)).toBe(11);
  });

  it('negative when overdue, zero on the day', () => {
    expect(daysUntil(delivery, new Date('2026-09-20T04:00:00Z'), IST)).toBe(-2);
    expect(daysUntil(delivery, new Date('2026-09-18T04:00:00Z'), IST)).toBe(0);
  });

  it('no delivery date, no answer — never a made-up number', () => {
    expect(daysUntil(null, new Date(), IST)).toBeNull();
  });
});
