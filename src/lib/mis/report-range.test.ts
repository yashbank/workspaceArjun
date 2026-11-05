import { describe, expect, it } from 'vitest';

import { resolveRange } from './report-range';

const r = (freq: string, at: string) => resolveRange({ freq, at }, '2026-11-06');

describe('resolveRange (R8 T4)', () => {
  it('day, week (Monday start), month, quarter, year', () => {
    expect(r('day', '2026-11-06')).toMatchObject({ fromKey: '2026-11-06', toKey: '2026-11-07', days: 1, label: '6 Nov 2026' });
    expect(r('week', '2026-11-06')).toMatchObject({ fromKey: '2026-11-02', toKey: '2026-11-09', days: 7, label: '2 Nov 2026 – 8 Nov 2026' });
    expect(r('month', '2026-02-10')).toMatchObject({ fromKey: '2026-02-01', toKey: '2026-03-01', days: 28 });
    expect(r('quarter', '2026-11-06')).toMatchObject({ fromKey: '2026-10-01', toKey: '2027-01-01', label: 'Q4 2026' });
    expect(r('year', '2026-11-06')).toMatchObject({ fromKey: '2026-01-01', toKey: '2027-01-01', label: '2026' });
  });

  it('prev / next step by one whole range, across a year edge', () => {
    expect(r('month', '2026-01-15')).toMatchObject({ prevAt: '2025-12-01', nextAt: '2026-02-01' });
    expect(r('quarter', '2026-01-15')).toMatchObject({ prevAt: '2025-10-01', nextAt: '2026-04-01' });
    expect(r('week', '2026-11-06').prevAt).toBe('2026-10-26');
  });

  it('falls back to the default frequency and today on bad input', () => {
    expect(resolveRange({ freq: 'decade', at: '2026-13-45' }, '2026-11-06')).toMatchObject({ freq: 'month', at: '2026-11-06' });
    expect(resolveRange({ at: ['x'] }, '2026-11-06').at).toBe('2026-11-06');
  });
});
