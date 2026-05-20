import { describe, it, expect } from 'vitest';
import { getUserDisplayName, needsDisplayName } from './user-display';

describe('getUserDisplayName', () => {
  it('uses profile name when set', () => {
    expect(getUserDisplayName({ email: 'a@b.com', name: 'Sarthak' })).toBe('Sarthak');
  });

  it('falls back to email local-part', () => {
    expect(getUserDisplayName({ email: 'arya@company.com', name: null })).toBe('arya');
  });
});

describe('needsDisplayName', () => {
  it('true when name empty', () => {
    expect(needsDisplayName(null)).toBe(true);
    expect(needsDisplayName('  ')).toBe(true);
  });

  it('false when name set', () => {
    expect(needsDisplayName('Arya')).toBe(false);
  });
});
