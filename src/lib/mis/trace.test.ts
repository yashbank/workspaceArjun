import { describe, expect, it } from 'vitest';

import { MAX_QUERY, buildEvents, denied, none, normaliseQuery, ok, okOrNone, pairIssuer, personOrNull, qtyLabel, stamp, stampDate, summariseQc, type QcRow } from './trace';

const IST = 'Asia/Kolkata';
const at = (iso: string) => new Date(`${iso}+05:30`);

describe('a section is recorded, empty, or not visible — never silently missing', () => {
  it('keeps the three states distinct', () => {
    expect(ok([1])).toEqual({ state: 'ok', data: [1] });
    expect(none()).toEqual({ state: 'none' });
    expect(denied()).toEqual({ state: 'denied' });
  });

  it('an empty list is "nothing recorded", not an empty result', () => {
    expect(okOrNone([])).toEqual({ state: 'none' });
    expect(okOrNone([1, 2])).toEqual({ state: 'ok', data: [1, 2] });
  });
});

describe('the search text', () => {
  it('is a trimmed, capped string; anything else is no search', () => {
    expect(normaliseQuery('  RM-FBB-4417 ')).toBe('RM-FBB-4417');
    expect(normaliseQuery('x'.repeat(500))).toHaveLength(MAX_QUERY);
    for (const bad of [undefined, null, 5, ['a'], {}]) expect(normaliseQuery(bad)).toBe('');
  });
});

describe('stamps are the factory\'s (D22)', () => {
  it('formats dd/mm hh:mm on the factory clock', () => {
    expect(stamp(at('2026-09-06T11:20:00'), IST)).toBe('06/09 11:20');
    expect(stamp(new Date('2026-09-06T20:00:00Z'), IST)).toBe('07/09 01:30'); // the next factory day
    expect(stamp(new Date('2026-09-06T20:00:00Z'), 'UTC')).toBe('06/09 20:00');
  });

  it('adds the year only when it is not the current one', () => {
    const now = at('2026-09-10T10:00:00');
    expect(stamp(at('2026-09-06T11:20:00'), IST, now)).toBe('06/09 11:20');
    expect(stamp(at('2025-12-30T11:20:00'), IST, now)).toBe('30/12/2025 11:20');
  });

  it('a date alone is dd/mm/yyyy', () => {
    expect(stampDate(at('2026-09-06T01:00:00'), IST)).toBe('06/09/2026');
  });
});

describe('the event log — newest first, stable, only what exists', () => {
  const list = [
    { at: at('2026-08-21T09:14:00'), kind: 'RECEIVED' as const, subject: 'FBB', qty: 2400, unit: 'KG', by: 'S. Patil' },
    { at: at('2026-09-05T09:00:00'), kind: 'QC_FAILED' as const, subject: 'Shade', by: 'S. Kulkarni' },
    { at: at('2026-09-05T06:20:00'), kind: 'ISSUED' as const, subject: 'FBB', qty: 1240, unit: 'KG', by: 'R. Kumar' },
  ];

  it('sorts newest first and carries the label, the person and the quantity', () => {
    const e = buildEvents(list, IST);
    expect(e.map((x) => x.kind)).toEqual(['QC_FAILED', 'ISSUED', 'RECEIVED']);
    expect(e[0]).toMatchObject({ atLabel: '05/09 09:00', by: 'S. Kulkarni', qty: null });
    expect(e[1]).toMatchObject({ qty: 1240, unit: 'KG' });
  });

  it('a tie keeps input order, so the log never reshuffles between two loads', () => {
    const same = at('2026-09-05T09:00:00');
    const e = buildEvents([{ at: same, kind: 'PHASE_STARTED', subject: 'A', by: null }, { at: same, kind: 'PHASE_SIGNED', subject: 'B', by: null }], IST);
    expect(e.map((x) => x.subject)).toEqual(['A', 'B']);
  });

  it('a missing person stays null — never a blank that reads as "nobody did it"', () => {
    expect(buildEvents([{ at: at('2026-09-05T09:00:00'), kind: 'ORDER_RAISED', subject: 'ORD-1', by: null }], IST)[0].by).toBeNull();
  });

  it('does not mutate its input, and an empty list is empty', () => {
    const copy = [...list];
    buildEvents(list, IST);
    expect(list).toEqual(copy);
    expect(buildEvents([], IST)).toEqual([]);
  });
});

describe('summariseQc — a failure carries its clearance', () => {
  let n = 0;
  const q = (when: string, result: string, over: Partial<QcRow> = {}): QcRow => {
    n += 1;
    return { id: `c${n}`, bomStageId: null, parameterName: 'Shade', result, defectType: null, checkTime: at(when), by: 'S. Kulkarni', ...over };
  };

  it('counts what was taken, passed, failed and made ready', () => {
    const s = summariseQc([q('2026-09-05T06:00:00', 'PASS'), q('2026-09-05T07:00:00', 'FAIL'), q('2026-09-05T08:00:00', 'NA')], IST);
    expect(s).toMatchObject({ taken: 3, pass: 1, fail: 1, makeready: 1 });
  });

  it('a failure is cleared only by a LATER pass on the same stage and parameter', () => {
    const f = q('2026-09-05T09:00:00', 'FAIL', { defectType: 'major' });
    expect(summariseQc([f], IST).failures[0]).toMatchObject({ parameter: 'Shade', atLabel: '05/09 09:00', defectType: 'major', cleared: null });
    expect(summariseQc([f, q('2026-09-05T09:40:00', 'PASS', { by: 'A. Bhaskar' })], IST).failures[0]).toMatchObject({ cleared: '05/09 09:40', clearedBy: 'A. Bhaskar' });
  });

  it('an earlier pass, another parameter, another stage, or a failed re-check does not clear it', () => {
    const f = q('2026-09-05T09:00:00', 'FAIL');
    for (const other of [q('2026-09-05T08:00:00', 'PASS'), q('2026-09-05T09:40:00', 'PASS', { parameterName: 'Registration' }), q('2026-09-05T09:40:00', 'PASS', { bomStageId: 's2' }), q('2026-09-05T09:40:00', 'FAIL')]) {
      expect(summariseQc([f, other], IST).failures[0].cleared).toBeNull();
    }
  });

  it('a check with no parameter is "General" on both sides', () => {
    expect(summariseQc([q('2026-09-05T09:00:00', 'FAIL', { parameterName: null }), q('2026-09-05T09:30:00', 'PASS', { parameterName: null })], IST).failures[0].cleared).toBe('05/09 09:30');
  });

  it('nothing taken is zero, not NaN', () => {
    expect(summariseQc([], IST)).toEqual({ taken: 0, pass: 0, fail: 0, makeready: 0, failures: [] });
  });
});

describe('pairing a ledger row with the store transaction that names who issued it', () => {
  const txns = [{ itemId: 'i1', quantity: 1240, at: new Date('2026-09-05T00:50:00Z'), by: 'R. Kumar' }, { itemId: 'i2', quantity: 5, at: new Date('2026-09-05T00:50:00Z'), by: 'Other' }];

  it('matches on item, quantity and time', () => {
    expect(pairIssuer({ itemId: 'i1', quantity: 1240, at: new Date('2026-09-05T00:50:03Z') }, txns)).toBe('R. Kumar');
  });

  it('a different item, a different quantity or a distant time is no match — unknown, not a guess', () => {
    expect(pairIssuer({ itemId: 'i1', quantity: 1000, at: new Date('2026-09-05T00:50:00Z') }, txns)).toBeNull();
    expect(pairIssuer({ itemId: 'i3', quantity: 1240, at: new Date('2026-09-05T00:50:00Z') }, txns)).toBeNull();
    expect(pairIssuer({ itemId: 'i1', quantity: 1240, at: new Date('2026-09-05T01:50:00Z') }, txns)).toBeNull();
  });
});

describe('two identical issues seconds apart', () => {
  it('each store transaction names ONE issue — the second issue does not borrow the first\'s person', () => {
    const txns = [{ itemId: 'i1', quantity: 100, at: new Date('2026-09-05T00:50:00Z'), by: 'R. Kumar' }, { itemId: 'i1', quantity: 100, at: new Date('2026-09-05T00:50:05Z'), by: 'S. Patil' }];
    const used = new Set<number>();
    const a = { itemId: 'i1', quantity: 100, at: new Date('2026-09-05T00:50:00Z') };
    expect(pairIssuer(a, txns, used)).toBe('R. Kumar');
    expect(pairIssuer(a, txns, used)).toBe('S. Patil');
    expect(pairIssuer(a, txns, used)).toBeNull(); // a third issue has no transaction left to name
  });
});

describe('personOrNull', () => {
  it('a dash, blank or missing name is "not recorded" (null) — never a name', () => {
    for (const v of ['—', '  ', '', null, undefined]) expect(personOrNull(v)).toBeNull();
    expect(personOrNull(' S. Patil ')).toBe('S. Patil');
  });
});

describe('quantities', () => {
  it('use Indian grouping and drop a false .00', () => {
    expect(qtyLabel(1240)).toBe('1,240');
    expect(qtyLabel(240000)).toBe('2,40,000');
    expect(qtyLabel(24.8)).toBe('24.8');
    expect(qtyLabel(0)).toBe('0');
  });
});
