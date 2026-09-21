/**
 * D7's export: "the CSV is generated from the query that drew the chart, not a second one."
 *
 * These functions take the SAME `WastageReport` the screen draws and lay it out as rows — there is
 * no second computation, so the sheet and the screen cannot disagree. Pure: no Prisma, no React.
 */

import type { WastageReport } from './wastage';

export type Cell = string | number | null;

/**
 * One CSV field. Quoted when it holds a comma, quote, or newline. A TEXT cell that begins with
 * `=`, `+`, `-` or `@` is prefixed with an apostrophe so a spreadsheet reads it as text, not a
 * formula (CSV injection) — an order description is typed by a person. Numbers are written as
 * numbers, so a negative figure stays negative.
 */
export function csvField(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(Math.round(cell * 100) / 100) : '';
  const text = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly Cell[])[]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export const WASTAGE_CSV_PARTS = ['weekly', 'orders'] as const;
export type WastageCsvPart = (typeof WASTAGE_CSV_PARTS)[number];

export const OTHER_LABEL = 'Other or no phase';

const dmy = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

/** `weekly` is the chart (week × phase); `orders` is the top-orders table. */
export function wastageRows(report: WastageReport, part: WastageCsvPart): Cell[][] {
  const unit = report.unit ?? '';
  if (part === 'orders') {
    return [
      ['Order', 'Item', 'Waste', 'Output', '% of output', 'Unit'],
      ...report.topOrders.map((o): Cell[] => [o.orderNumber, o.description, o.waste, o.produced, o.percent === null ? null : Math.round(o.percent * 10) / 10, unit]),
    ];
  }
  return [
    ['Week starting', 'Phase', 'Waste', 'Unit'],
    ...report.weeks.flatMap((w) => report.series.map((s): Cell[] => [dmy(w.startKey), s.name ?? OTHER_LABEL, w.byKey[s.key] ?? 0, unit])),
  ];
}

export function wastageCsv(report: WastageReport, part: WastageCsvPart): string {
  return toCsv(wastageRows(report, part));
}

export function wastageFilename(report: WastageReport, part: WastageCsvPart): string {
  return `wastage-${part}-${report.range.fromKey}_${report.range.toKey}.csv`;
}
