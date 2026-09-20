import { describe, expect, it } from 'vitest';

import { DEFAULT_DAILY_WAGE_CODE, formatWageCode, nextWageCode } from './wage-code';

describe('formatWageCode', () => {
  it('pads the sequence to two digits', () => {
    expect(formatWageCode('DAILY', 1)).toBe('WG-DAILY-01');
    expect(formatWageCode('DAILY', 12)).toBe('WG-DAILY-12');
  });
});

describe('nextWageCode', () => {
  it('starts at 01 when no codes exist yet', () => {
    expect(nextWageCode('DAILY', [])).toBe(DEFAULT_DAILY_WAGE_CODE);
  });

  it('continues the sequence for the same unit', () => {
    expect(nextWageCode('DAILY', ['WG-DAILY-01', 'WG-DAILY-02'])).toBe('WG-DAILY-03');
  });

  it('ignores codes from a different unit', () => {
    expect(nextWageCode('MONTHLY', ['WG-DAILY-01', 'WG-DAILY-02'])).toBe('WG-MONTHLY-01');
  });

  it('does not reuse a gap left by a deleted code', () => {
    expect(nextWageCode('DAILY', ['WG-DAILY-01', 'WG-DAILY-03'])).toBe('WG-DAILY-04');
  });

  it('ignores a malformed or unrelated string without throwing', () => {
    expect(nextWageCode('DAILY', ['not-a-code', 'WG-DAILY-'])).toBe('WG-DAILY-01');
  });
});
