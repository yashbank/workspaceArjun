import { describe, expect, it } from 'vitest';
import { aqlPlan, parseInspectionLevel, sampleSizeCodeLetter, thresholdsFromPlan } from './aql';

describe('Z1.4 code letters (Table I)', () => {
  it.each([
    [281, 'II', 'H'], [500, 'II', 'H'], [501, 'II', 'J'], [2, 'II', 'A'], [3200, 'II', 'K'], [3201, 'II', 'L'],
    [281, 'I', 'F'], [281, 'III', 'J'], [1000000, 'II', 'Q'], [1000000, 'III', 'R'],
  ] as const)('lot %i level %s -> %s', (lot, level, letter) => {
    expect(sampleSizeCodeLetter(lot, level)).toBe(letter);
  });
});

describe('Z1.4 single normal plans (Table II-A)', () => {
  it('lot 281-500 level II = H, n 50; AQL 2.5 -> 3/4, AQL 1.0 -> 1/2', () => {
    expect(aqlPlan(400, 'II', 2.5)).toMatchObject({ codeLetter: 'H', sampleSize: 50, accept: 3, reject: 4 });
    expect(aqlPlan(400, 'II', 1.0)).toMatchObject({ sampleSize: 50, accept: 1, reject: 2 });
  });
  it('lot 501-1200 level II = J, n 80; AQL 2.5 -> 5/6, 6.5 -> 10/11, 1.0 -> 2/3', () => {
    expect(aqlPlan(800, 'II', 2.5)).toMatchObject({ sampleSize: 80, accept: 5, reject: 6 });
    expect(aqlPlan(800, 'II', 6.5)).toMatchObject({ accept: 10, reject: 11 });
    expect(aqlPlan(800, 'II', 1.0)).toMatchObject({ accept: 2, reject: 3 });
  });
  it('follows the down arrow: letter above a column start uses the first numbered row', () => {
    expect(aqlPlan(20, 'II', 1.0)).toMatchObject({ codeLetter: 'C', usedLetter: 'G', sampleSize: 20, accept: 0, reject: 1 });
    expect(aqlPlan(400, 'II', 0.065)).toMatchObject({ usedLetter: 'N', accept: 0, reject: 1 });
  });
  it('follows the up arrow: nothing beyond 21/22', () => {
    expect(aqlPlan(1_000_000, 'III', 6.5)).toMatchObject({ codeLetter: 'R', usedLetter: 'L', sampleSize: 200, accept: 21, reject: 22 });
  });
  it('snaps a free-typed AQL to the table and maps to thresholds', () => {
    const plan = aqlPlan(400, 'II', 2.4);
    expect(plan.aql).toBe(2.5);
    expect(thresholdsFromPlan(plan)).toEqual({ sampleSize: 50, criticalMax: 0, majorMax: 3, minorMax: 3 });
  });
  it('parses levels', () => {
    expect(parseInspectionLevel(' level ii ')).toBe('II');
    expect(parseInspectionLevel('3')).toBe('III');
    expect(parseInspectionLevel('')).toBeNull();
    expect(parseInspectionLevel(null)).toBeNull();
  });
});

describe('resolveAqlPlan', async () => {
  const { resolveAqlPlan } = await import('./aql');
  it('uses the saved level and limit; unset level -> null', async () => {
    const saved: Record<string, string> = { 'qc.aql_level': 'II', 'qc.acceptable_quality_limit': '1.0' };
    expect(await resolveAqlPlan(async (k) => saved[k] ?? null, 400)).toMatchObject({ sampleSize: 50, accept: 1, reject: 2 });
    expect(await resolveAqlPlan(async () => null, 400)).toBeNull();
    expect(await resolveAqlPlan(async () => { throw new Error('x'); }, 400)).toBeNull();
  });
  it('limit unset -> 2.5', async () => {
    expect(await resolveAqlPlan(async (k) => (k === 'qc.aql_level' ? 'II' : null), 400)).toMatchObject({ aql: 2.5, accept: 3 });
  });
});
