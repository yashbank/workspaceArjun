/**
 * Quantities grouped by unit, never added across units (R3-QCR B76).
 *
 * A production log row carries ONE unit. 500 PIECE and 200 KG are two figures, not "700".
 * Units are normalised (trim, upper-case) so "kg" and "KG " merge. Pure: no Prisma, no React.
 *
 * FROZEN CONTRACT (consumed by R3-PRD in wave 2; do not change the signatures):
 *   sumByUnit(rows: { qty: number; unit: string | null | undefined }[]): { unit: string; qty: number }[]
 *   formatQtyByUnit(rows: { unit: string; qty: number }[]): string
 */

export type QtyByUnit = { unit: string; qty: number };

/** Shown for a row that carries no unit at all, so it is still counted and visible. */
export const NO_UNIT = '—';

export function normaliseUnit(unit: string | null | undefined): string {
  const u = (unit ?? '').trim().toUpperCase();
  return u === '' ? NO_UNIT : u;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function sumByUnit(rows: { qty: number; unit: string | null | undefined }[]): QtyByUnit[] {
  const byUnit = new Map<string, number>();
  for (const r of rows) {
    const qty = Number(r.qty);
    if (!Number.isFinite(qty)) continue;
    const unit = normaliseUnit(r.unit);
    byUnit.set(unit, (byUnit.get(unit) ?? 0) + qty);
  }
  return [...byUnit.entries()]
    .map(([unit, qty]) => ({ unit, qty: round2(qty) }))
    .sort((a, b) => a.unit.localeCompare(b.unit));
}

const NUMBER_FORMAT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** `12,500.5`: Indian digit grouping, at most 2 dp. Explicit Intl locale, not `toLocale*` (X2). */
export function formatQty(qty: number): string {
  return NUMBER_FORMAT.format(qty);
}

/** `500 PIECE · 200 KG`; an empty list reads `—`. */
export function formatQtyByUnit(rows: QtyByUnit[]): string {
  if (rows.length === 0) return '—';
  return rows.map((r) => `${formatQty(r.qty)} ${r.unit === NO_UNIT ? '' : r.unit}`.trim()).join(' · ');
}
