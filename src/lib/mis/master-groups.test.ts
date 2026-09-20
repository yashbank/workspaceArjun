import { describe, expect, it } from 'vitest';

import { MASTER_GROUPS, toOptionValue } from './master-groups';

describe('toOptionValue', () => {
  it('normalises a typed label into a stable value', () => {
    expect(toOptionValue('80 GSM')).toBe('80_GSM');
    expect(toOptionValue('  Matt Coating ')).toBe('MATT_COATING');
    expect(toOptionValue('A4/A3')).toBe('A4_A3');
  });

  it('does not leave leading or trailing separators', () => {
    expect(toOptionValue('--test--')).toBe('TEST');
  });

  it('is stable for the same label typed twice with different spacing', () => {
    expect(toOptionValue('Sheet  Fed')).toBe(toOptionValue(' sheet fed '));
  });
});

describe('MASTER_GROUPS', () => {
  it('ships the seven groups from the spec', () => {
    expect(MASTER_GROUPS).toHaveLength(7);
    expect(MASTER_GROUPS).toContain('ITEM_TYPE');
  });
});
