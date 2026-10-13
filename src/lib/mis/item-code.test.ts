import { describe, expect, it } from 'vitest';
import { formatItemCode, nextItemCodeNumber } from './item-code';

describe('R3-MST B24 item codes', () => {
  it('takes 1 + the max ITM number and ignores other shapes', () => {
    expect(nextItemCodeNumber(['ITM-0001', 'ITM-0007', 'X-9'])).toBe(8);
  });
  it('starts at 1 for no codes', () => {
    expect(nextItemCodeNumber([])).toBe(1);
  });
  it('pads to 4 digits and prints 5+ digits as is', () => {
    expect(formatItemCode(8)).toBe('ITM-0008');
    expect(formatItemCode(nextItemCodeNumber(['ITM-9999']))).toBe('ITM-10000');
  });
});
