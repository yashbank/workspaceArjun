/**
 * The maths behind D7's wastage report.
 *
 * D7's rules, each a function here so it is tested as logic rather than read off a picture:
 *
 * - **One unit, one axis.** "Everything on the trend is Kg, so it stacks honestly." A production
 *   log row carries ONE `unit`; a report never adds Kg to Nos. The chosen unit filters every
 *   figure on the screen, and the other units present are reported so the screen can offer them.
 * - **The denominator is always stated.** A percentage here is waste ÷ output IN THE SAME ROWS,
 *   and null — never 0% — when there was no output to divide by.
 * - **Phase hues are fixed, never cycled, never repainted.** They are assigned by rank of waste
 *   over the WHOLE window before any machine filter, so filtering to one machine does not recolour
 *   a phase. Only four phases get a series hue; the rest fold into one neutral "other" series
 *   rather than wrapping the palette around ("a fifth colour that is really the first").
 * - **Weeks are the factory's** (D22): every log is bucketed by its factory-zone date, Monday to
 *   Sunday, never by the server's clock.
 * - **No invented figure.** There is no wastage allowance recorded anywhere, so nothing here
 *   computes "% of allowance", a breach, or a target line.
 *
 * Pure: no Prisma, no React.
 */

import { addDaysToDateKey, factoryDateKey } from './factory-time';
import { weekStartKey } from './machine-timeline';
import { seriesHue } from './chart';

export type WastageLog = {
  loggedAt: Date;
  qtyProduced: number;
  qtyWaste: number;
  unit: string;
  machineId: string | null;
  machineName: string | null;
  orderId: string;
  orderNumber: string;
  description: string | null;
  /** The process the row was booked to; null when it was logged against no phase. */
  phaseName: string | null;
};

export const OTHER_KEY = '__other';
/** Series that get a real hue. The palette has five; four named phases leaves the fifth unspent. */
export const NAMED_SERIES = 4;
/** Neutral, and deliberately not one of the series hues or a state colour. */
export const OTHER_HUE = '#94a3b8';

export type WastageSeries = { key: string; /** null = "Other or no phase" — the screen words it */ name: string | null; hue: string };
export type WastageWeek = { key: string; startKey: string; total: number; byKey: Record<string, number> };
export type WastageMachine = { id: string; name: string; waste: number; produced: number; percent: number | null };
export type WastageOrder = { orderId: string; orderNumber: string; description: string | null; waste: number; produced: number; percent: number | null };

export type WastageReport = {
  range: { fromKey: string; toKey: string; weeks: number };
  /** The unit every figure is in; null when there is nothing in the window. */
  unit: string | null;
  /** Every unit seen in the window, largest waste first — so the screen can offer the others. */
  units: { unit: string; waste: number }[];
  /** Machines seen in the window (unit-filtered), for the filter. */
  machines: { id: string; name: string }[];
  machineId: string | null;
  series: WastageSeries[];
  weeks: WastageWeek[];
  totals: { waste: number; produced: number; percent: number | null; orders: number; entries: number };
  byMachine: WastageMachine[];
  topOrders: WastageOrder[];
};

export const WEEK_CHOICES = [4, 10, 13, 26] as const;
export const DEFAULT_WEEKS = 10;

/** A requested span, kept to a sensible choice. */
export function clampWeeks(value: unknown): number {
  // A repeated query parameter arrives as an array, and Number(['4']) is 4 — accept only a number or a string.
  if (typeof value !== 'number' && typeof value !== 'string') return DEFAULT_WEEKS;
  const n = Math.trunc(Number(value));
  return (WEEK_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_WEEKS;
}

/** The share of `produced` that `waste` is, as a percentage — or null when there is no output. */
export function percentOf(waste: number, produced: number): number | null {
  return produced > 0 ? (waste / produced) * 100 : null;
}

/** Week start keys, oldest first, ending with the week that contains `lastKey`. */
export function weekStarts(lastKey: string, weeks: number): string[] {
  const last = weekStartKey(lastKey);
  const out: string[] = [];
  for (let back = weeks - 1; back >= 0; back -= 1) out.push(addDaysToDateKey(last, -7 * back));
  return out;
}

/** The first factory date and the last a `weeks` window covers (Monday of the oldest week → `lastKey`). */
export function windowKeys(lastKey: string, weeks: number): { fromKey: string; toKey: string } {
  return { fromKey: weekStarts(lastKey, weeks)[0], toKey: lastKey };
}

const isSame = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

export function buildWastage(
  logs: readonly WastageLog[],
  options: { timeZone: string; lastKey: string; weeks: number; unit?: string | null; machineId?: string | null },
): WastageReport {
  const { timeZone, lastKey, weeks } = options;
  const starts = weekStarts(lastKey, weeks);
  const { fromKey, toKey } = windowKeys(lastKey, weeks);
  const weekIndex = new Map(starts.map((key, i) => [key, i]));

  // Bucket by FACTORY date; anything outside the window (the caller over-fetches a day either side) is dropped.
  const inWindow: { log: WastageLog; week: number }[] = [];
  for (const log of logs) {
    const key = factoryDateKey(log.loggedAt, timeZone);
    if (key < fromKey || key > toKey) continue;
    const week = weekIndex.get(weekStartKey(key));
    if (week === undefined) continue;
    inWindow.push({ log, week });
  }

  // --- units: never summed across ---------------------------------------------------------
  const byUnit = new Map<string, number>();
  for (const { log } of inWindow) byUnit.set(log.unit, (byUnit.get(log.unit) ?? 0) + log.qtyWaste);
  const units = [...byUnit.entries()].map(([unit, waste]) => ({ unit, waste })).sort((a, b) => b.waste - a.waste || a.unit.localeCompare(b.unit));
  const requested = options.unit ? units.find((u) => isSame(u.unit, options.unit!))?.unit : undefined;
  const unit = requested ?? units[0]?.unit ?? null;
  const ofUnit = inWindow.filter(({ log }) => unit !== null && log.unit === unit);

  // --- phase series: rank over the whole window (unit-filtered, machine-UNfiltered) ----------
  const phaseWaste = new Map<string, number>();
  for (const { log } of ofUnit) if (log.phaseName) phaseWaste.set(log.phaseName, (phaseWaste.get(log.phaseName) ?? 0) + log.qtyWaste);
  const ranked = [...phaseWaste.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  const named = ranked.slice(0, NAMED_SERIES);
  const seriesKey = (phase: string | null) => (phase && named.includes(phase) ? phase : OTHER_KEY);
  const series: WastageSeries[] = named.map((name, i) => ({ key: name, name, hue: seriesHue(i) }));
  if (ofUnit.some(({ log }) => seriesKey(log.phaseName) === OTHER_KEY)) series.push({ key: OTHER_KEY, name: null, hue: OTHER_HUE });

  // --- machines (unit-filtered; ignoring the machine filter — it is a comparison across them) ---
  const machineAgg = new Map<string, { name: string; waste: number; produced: number }>();
  for (const { log } of ofUnit) {
    if (!log.machineId) continue;
    const m = machineAgg.get(log.machineId) ?? { name: log.machineName ?? '—', waste: 0, produced: 0 };
    m.waste += log.qtyWaste;
    m.produced += log.qtyProduced;
    machineAgg.set(log.machineId, m);
  }
  const byMachine: WastageMachine[] = [...machineAgg.entries()]
    .map(([id, m]) => ({ id, name: m.name, waste: m.waste, produced: m.produced, percent: percentOf(m.waste, m.produced) }))
    .sort((a, b) => b.waste - a.waste || a.name.localeCompare(b.name));
  const machines = [...machineAgg.entries()].map(([id, m]) => ({ id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name));
  const machineId = options.machineId && machineAgg.has(options.machineId) ? options.machineId : null;

  // --- everything else respects the machine filter ------------------------------------------
  const scoped = machineId ? ofUnit.filter(({ log }) => log.machineId === machineId) : ofUnit;

  const weekRows: WastageWeek[] = starts.map((startKey) => ({ key: startKey, startKey, total: 0, byKey: {} }));
  const orderAgg = new Map<string, { orderNumber: string; description: string | null; waste: number; produced: number }>();
  let waste = 0;
  let produced = 0;
  for (const { log, week } of scoped) {
    const row = weekRows[week];
    const key = seriesKey(log.phaseName);
    row.byKey[key] = (row.byKey[key] ?? 0) + log.qtyWaste;
    row.total += log.qtyWaste;
    waste += log.qtyWaste;
    produced += log.qtyProduced;
    const o = orderAgg.get(log.orderId) ?? { orderNumber: log.orderNumber, description: log.description, waste: 0, produced: 0 };
    o.waste += log.qtyWaste;
    o.produced += log.qtyProduced;
    orderAgg.set(log.orderId, o);
  }

  const topOrders: WastageOrder[] = [...orderAgg.entries()]
    .map(([orderId, o]) => ({ orderId, orderNumber: o.orderNumber, description: o.description, waste: o.waste, produced: o.produced, percent: percentOf(o.waste, o.produced) }))
    .filter((o) => o.waste > 0)
    .sort((a, b) => b.waste - a.waste || a.orderNumber.localeCompare(b.orderNumber))
    .slice(0, 5);

  return {
    range: { fromKey, toKey, weeks },
    unit,
    units,
    machines,
    machineId,
    series,
    weeks: weekRows,
    totals: { waste, produced, percent: percentOf(waste, produced), orders: orderAgg.size, entries: scoped.length },
    byMachine,
    topOrders,
  };
}
