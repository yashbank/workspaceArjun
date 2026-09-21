import { describe, expect, it } from 'vitest';

import { buildWastage, type WastageLog } from './wastage';
import { OTHER_LABEL, csvField, toCsv, wastageCsv, wastageFilename, wastageRows } from './wastage-csv';

describe('csvField', () => {
  it('quotes a field with a comma, a quote or a newline, and doubles inner quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField('plain')).toBe('plain');
  });

  it('defuses a spreadsheet formula typed into a text field (CSV injection)', () => {
    expect(csvField('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-2')).toBe("'-2");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('writes numbers as numbers — a negative figure is not mistaken for a formula — and null as empty', () => {
    expect(csvField(-3.456)).toBe('-3.46');
    expect(csvField(12)).toBe('12');
    expect(csvField(null)).toBe('');
    expect(csvField(Number.NaN)).toBe('');
  });

  it('toCsv joins with CRLF and ends with one', () => {
    expect(toCsv([['a', 1], ['b', null]])).toBe('a,1\r\nb,\r\n');
  });
});

const logs: WastageLog[] = [
  { loggedAt: new Date('2026-09-08T06:00:00Z'), qtyProduced: 1000, qtyWaste: 31, unit: 'KG', machineId: 'm', machineName: 'M', orderId: 'o1', orderNumber: 'ORD-1', description: '=cmd, "x"', phaseName: 'Printing' },
  { loggedAt: new Date('2026-09-15T06:00:00Z'), qtyProduced: 500, qtyWaste: 5, unit: 'KG', machineId: 'm', machineName: 'M', orderId: 'o2', orderNumber: 'ORD-2', description: null, phaseName: null },
];
const report = buildWastage(logs, { timeZone: 'Asia/Kolkata', lastKey: '2026-09-16', weeks: 2 });

describe('the export is the report, laid out — not a second computation', () => {
  it('weekly: one row per week × series, and the cells add up to the report totals', () => {
    const rows = wastageRows(report, 'weekly');
    expect(rows[0]).toEqual(['Week starting', 'Phase', 'Waste', 'Unit']);
    const body = rows.slice(1);
    expect(body).toHaveLength(report.weeks.length * report.series.length);
    expect(body.reduce((s, r) => s + (r[2] as number), 0)).toBe(report.totals.waste);
    expect(body.every((r) => r[3] === 'KG')).toBe(true);
    expect(body.map((r) => r[1])).toContain(OTHER_LABEL);
    expect(body[0][0]).toBe('07/09/2026');
  });

  it('orders: the same rows the screen lists, percent to one decimal, a text cell defused', () => {
    const csv = wastageCsv(report, 'orders');
    const rows = wastageRows(report, 'orders');
    expect(rows.slice(1).map((r) => r[0])).toEqual(report.topOrders.map((o) => o.orderNumber));
    expect(rows[1]).toEqual(['ORD-1', '=cmd, "x"', 31, 1000, 3.1, 'KG']);
    expect(csv).toContain(`"'=cmd, ""x"""`);
  });

  it('an empty report still yields a header row', () => {
    const empty = buildWastage([], { timeZone: 'Asia/Kolkata', lastKey: '2026-09-16', weeks: 2 });
    expect(wastageCsv(empty, 'weekly')).toBe('Week starting,Phase,Waste,Unit\r\n');
    expect(wastageCsv(empty, 'orders')).toBe('Order,Item,Waste,Output,% of output,Unit\r\n');
  });

  it('the filename says what and when', () => {
    expect(wastageFilename(report, 'weekly')).toBe('wastage-weekly-2026-09-07_2026-09-16.csv'.replace('09-07', report.range.fromKey.slice(5)));
  });
});
