import { describe, expect, it } from 'vitest';

import { resolveAsOf } from './effective-dated';

const row = (effectiveFrom: string, v: string) => ({ effectiveFrom: new Date(effectiveFrom), v });
const HISTORY = [row('2026-01-01', 'a'), row('2026-02-10', 'b'), row('2026-03-01', 'c')];

describe('resolveAsOf', () => {
  it('returns the row in force on the day — not the newest row', () => {
    expect(resolveAsOf(HISTORY, new Date('2026-01-31'))?.v).toBe('a');
    expect(resolveAsOf(HISTORY, new Date('2026-02-20'))?.v).toBe('b');
    expect(resolveAsOf(HISTORY, new Date('2026-09-01'))?.v).toBe('c');
  });

  it('a row applies ON its effective date, not the day after', () => {
    expect(resolveAsOf(HISTORY, new Date('2026-02-10'))?.v).toBe('b');
    expect(resolveAsOf(HISTORY, new Date('2026-02-09'))?.v).toBe('a');
  });

  it('time of day is ignored — 23:59 on the 9th is still the 9th', () => {
    expect(resolveAsOf(HISTORY, new Date('2026-02-09T23:59:59Z'))?.v).toBe('a');
    expect(resolveAsOf(HISTORY, new Date('2026-02-10T00:00:00Z'))?.v).toBe('b');
  });

  it('null when nothing had applied yet — the caller falls back, it is not an error', () => {
    expect(resolveAsOf(HISTORY, new Date('2025-12-31'))).toBeNull();
    expect(resolveAsOf([], new Date('2026-01-01'))).toBeNull();
  });

  it('does not depend on the order the rows arrive in', () => {
    expect(resolveAsOf([...HISTORY].reverse(), new Date('2026-02-20'))?.v).toBe('b');
  });
});
