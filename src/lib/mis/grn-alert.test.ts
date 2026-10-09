import { describe, expect, it } from 'vitest';

import { grnAlertHeadline, grnAlertLines, grnPriceVariance } from './grn-alert';

const lines = [
  { description: 'Kraft', ordered: 100, received: 90, damaged: 4, short: 6, ratePerUnit: 10 },
  { description: 'Ink', ordered: 5, received: 5, damaged: 0, short: null, ratePerUnit: 200 },
];

describe('grnAlertLines', () => {
  it('carries PO vs received, damage and short per line, and flags attention when any line is off', () => {
    const a = grnAlertLines(lines);
    expect(a.lines[0]).toEqual({ description: 'Kraft', ordered: 100, received: 90, damaged: 4, short: 6, outstanding: 10 });
    expect(a.totals).toEqual({ ordered: 105, received: 95, damaged: 4, short: 6 });
    expect(a.attention).toBe(true);
    expect(grnAlertLines([lines[1]]).attention).toBe(false);
  });
  it('a planned split delivery is not flagged: outstanding uses the PO line\'s received-to-date, and attention needs damage or short', () => {
    const a = grnAlertLines([{ description: 'Kraft', ordered: 300, received: 100, receivedToDate: 200, damaged: 0, short: null }]);
    expect(a.lines[0].outstanding).toBe(100);
    expect(a.attention).toBe(false);
  });
});

describe('grnPriceVariance', () => {
  it('invoice minus received-at-PO-rate; null without an invoice amount or a rate', () => {
    expect(grnPriceVariance(lines, 2000)).toEqual({ receivedValue: 1900, invoiced: 2000, variance: 100 });
    expect(grnPriceVariance(lines, null)).toBeNull();
    expect(grnPriceVariance(lines.map(({ ratePerUnit: _r, ...l }) => l), 2000)).toBeNull();
  });
});

describe('grnAlertHeadline', () => {
  it('reads like a sentence a person would say', () => {
    expect(grnAlertHeadline(grnAlertLines(lines))).toBe('2 lines · 95 received of 105 · 6 short · 4 damaged');
  });
});
