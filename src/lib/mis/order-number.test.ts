import { describe, expect, it } from 'vitest';
import { formatOrderNumber, sanitizeOrderPrefix } from './order-number';

describe('order number', () => {
  it('falls back to ORD', () => {
    expect(sanitizeOrderPrefix(null)).toBe('ORD');
    expect(sanitizeOrderPrefix('  !! ')).toBe('ORD');
  });
  it('sanitizes', () => {
    expect(sanitizeOrderPrefix(' bpp-so ')).toBe('BPP-SO');
    expect(sanitizeOrderPrefix('abc def_9')).toBe('ABCDEF9');
    expect(sanitizeOrderPrefix('ABCDEFGHIJKL')).toBe('ABCDEFGH');
  });
  it('formats', () => {
    expect(formatOrderNumber(undefined, 2026, 3, '12345')).toBe('ORD-202603-12345');
    expect(formatOrderNumber('SO', 2026, 11, '00042')).toBe('SO-202611-00042');
  });
});

describe('resolveOrderPrefix', async () => {
  const { resolveOrderPrefix } = await import('./order-number');
  it('reads, sanitizes, falls back', async () => {
    expect(await resolveOrderPrefix(async () => 'so')).toBe('SO');
    expect(await resolveOrderPrefix(async () => null)).toBe('ORD');
    expect(await resolveOrderPrefix(async () => { throw new Error('x'); })).toBe('ORD');
  });
});
