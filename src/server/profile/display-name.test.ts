import { describe, it, expect } from 'vitest';
import { normalizeDisplayName } from '@/lib/display-name';

describe('normalizeDisplayName', () => {
  it('trims and lowercases', () => {
    expect(normalizeDisplayName('  DJ  ')).toBe('dj');
    expect(normalizeDisplayName('dj')).toBe('dj');
    expect(normalizeDisplayName('DJ')).toBe('dj');
  });
});
