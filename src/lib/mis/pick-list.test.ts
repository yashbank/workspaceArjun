import { describe, expect, it } from 'vitest';

import { applyPicks, canRecordPicks, handoverCart, nextPickStatus, pickProgress, stagingRefusal } from './pick-list';

const L = [
  { id: 'a', requiredQty: 10, pickedQty: 0 },
  { id: 'b', requiredQty: 5, pickedQty: 0 },
];

describe('pick list state machine', () => {
  it('walks PENDING -> PICKING -> STAGED -> HANDED_OVER and stops', () => {
    expect(nextPickStatus('PENDING')).toBe('PICKING');
    expect(nextPickStatus('PICKING')).toBe('STAGED');
    expect(nextPickStatus('STAGED')).toBe('HANDED_OVER');
    expect(nextPickStatus('HANDED_OVER')).toBeNull();
  });
  it('picks can be recorded only before staging', () => {
    expect(canRecordPicks('PENDING')).toBe(true);
    expect(canRecordPicks('PICKING')).toBe(true);
    expect(canRecordPicks('STAGED')).toBe(false);
    expect(canRecordPicks('HANDED_OVER')).toBe(false);
  });
});

describe('applyPicks', () => {
  it('records picked quantities, rounded to 2 dp, leaving other lines alone', () => {
    const out = applyPicks(L, [{ lineId: 'a', pickedQty: 9.996 }]);
    expect(out).toEqual([{ id: 'a', requiredQty: 10, pickedQty: 10 }, { id: 'b', requiredQty: 5, pickedQty: 0 }]);
  });
  it('refuses more than approved, negatives, unknown and duplicate lines', () => {
    expect(() => applyPicks(L, [{ lineId: 'a', pickedQty: 10.01 }])).toThrow(/only 10 was approved/);
    expect(() => applyPicks(L, [{ lineId: 'a', pickedQty: -1 }])).toThrow(/negative/);
    expect(() => applyPicks(L, [{ lineId: 'zz', pickedQty: 1 }])).toThrow(/not on this pick list/);
    expect(() => applyPicks(L, [{ lineId: 'a', pickedQty: 1 }, { lineId: 'a', pickedQty: 2 }])).toThrow(/twice/);
    expect(() => applyPicks(L, [{ lineId: 'a', pickedQty: Number.NaN }])).toThrow(/negative/);
  });
});

describe('staging and handover', () => {
  it('cannot stage an empty pick', () => {
    expect(stagingRefusal(L)).toMatch(/at least one line/);
    expect(stagingRefusal([{ id: 'a', requiredQty: 1, pickedQty: 1 }])).toBeNull();
  });
  it('the handover cart carries only what was picked — stock moves for nothing else', () => {
    expect(handoverCart([{ id: 'a', requiredQty: 10, pickedQty: 4 }, { id: 'b', requiredQty: 5, pickedQty: 0 }])).toEqual([{ lineId: 'a', qty: 4 }]);
  });
  it('progress reports completeness', () => {
    expect(pickProgress([{ id: 'a', requiredQty: 10, pickedQty: 10 }])).toEqual({ picked: 10, required: 10, complete: true });
    expect(pickProgress(L).complete).toBe(false);
  });
});
