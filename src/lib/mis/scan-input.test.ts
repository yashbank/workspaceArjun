import { describe, expect, it } from 'vitest';

import { matchScannedItem, scanCandidates, scanErrorMessage, scanOutcome } from './scan-input';

const ITEMS = [
  { id: '1', code: 'PPR-0012', sku: 'SKU-A' },
  { id: '2', code: 'INK-0003', sku: null },
  { id: '3', code: 'glue-1', sku: '8901234567890' },
];

describe('scanCandidates', () => {
  it('is empty for blank or control-character-only input', () => {
    expect(scanCandidates('')).toEqual([]);
    expect(scanCandidates('  \n\t ')).toEqual([]);
  });
  it('keeps a bare code and strips scanner control characters', () => {
    expect(scanCandidates('PPR-0012\r\n')).toEqual(['PPR-0012']);
  });
  it('strips a CODE: / SKU= tag', () => {
    expect(scanCandidates('CODE: PPR-0012')).toContain('PPR-0012');
    expect(scanCandidates('sku=SKU-A')).toContain('SKU-A');
  });
  it('reads the code out of a URL path or query', () => {
    expect(scanCandidates('https://mis.example.com/mis/store/ledger/PPR-0012')).toContain('PPR-0012');
    expect(scanCandidates('https://mis.example.com/i?code=INK-0003&x=1')).toContain('INK-0003');
  });
  it('reads a JSON payload and survives malformed JSON', () => {
    expect(scanCandidates('{"code":"PPR-0012","qty":5}')[0]).toBe('PPR-0012');
    expect(scanCandidates('{not json')).toEqual(['{not json']);
  });
  it('does not repeat a candidate that differs only by case', () => {
    expect(scanCandidates('code:ppr-0012').filter((c) => c.toLowerCase() === 'ppr-0012')).toHaveLength(1);
  });
});

describe('matchScannedItem', () => {
  it('matches the code exactly, ignoring case', () => {
    expect(matchScannedItem(ITEMS, 'ppr-0012')?.id).toBe('1');
    expect(matchScannedItem(ITEMS, 'GLUE-1')?.id).toBe('3');
  });
  it('matches a SKU / EAN barcode', () => {
    expect(matchScannedItem(ITEMS, '8901234567890')?.id).toBe('3');
    expect(matchScannedItem(ITEMS, 'SKU-A')?.id).toBe('1');
  });
  it('matches through a URL or tag', () => {
    expect(matchScannedItem(ITEMS, 'https://x.test/items/INK-0003')?.id).toBe('2');
    expect(matchScannedItem(ITEMS, 'item:INK-0003')?.id).toBe('2');
  });
  it('never matches loosely: a partial code or an empty scan is null', () => {
    expect(matchScannedItem(ITEMS, 'PPR')).toBeNull();
    expect(matchScannedItem(ITEMS, '')).toBeNull();
    expect(matchScannedItem(ITEMS, 'UNKNOWN-1')).toBeNull();
  });
  it('an item with a null SKU is never matched by an empty candidate', () => {
    expect(matchScannedItem(ITEMS, '   ')).toBeNull();
  });
});

describe('scanErrorMessage', () => {
  it('names the cause in words and always offers typing', () => {
    for (const name of ['NotAllowedError', 'SecurityError', 'NotFoundError', 'OverconstrainedError', 'NotReadableError', 'Unsupported', 'Weird', null, undefined]) {
      expect(scanErrorMessage(name as string | null)).toMatch(/type the code instead/i);
    }
    expect(scanErrorMessage('NotAllowedError')).toMatch(/blocked/);
    expect(scanErrorMessage('NotFoundError')).toMatch(/No camera/);
  });
});

describe('scanOutcome', () => {
  const named = ITEMS.map((i) => ({ ...i, name: `Item ${i.id}` }));
  it('a hit adds the item and clears the fallback', () => {
    expect(scanOutcome(named, 'INK-0003')).toMatchObject({ item: { id: '2' }, message: 'Scanned Item 2', fallbackQuery: '' });
  });
  it('a miss keeps the scanned text for typing on, instead of failing silently', () => {
    const out = scanOutcome(named, 'code: ZZZ-9');
    expect(out.item).toBeNull();
    expect(out.fallbackQuery).toBe('code: ZZZ-9');
    expect(out.message).toMatch(/Nothing matches/);
  });
});
