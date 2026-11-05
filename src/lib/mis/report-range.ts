/**
 * R8 T4: the one date range the dashboard and the reports share. It lives in the URL as
 * `?freq=day|week|month|quarter|year&at=yyyy-MM-dd` (`at` is any day inside the range).
 * Pure: factory date keys only, no zone, no Prisma, no React.
 */

import { addDaysToDateKey, zonedParts } from './factory-time';
import { weekStartKey } from './machine-timeline';

export const FREQS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type Freq = (typeof FREQS)[number];
export const DEFAULT_FREQ: Freq = 'month';

export type KeyRange = {
  freq: Freq;
  /** The anchor day, normalised. */
  at: string;
  fromKey: string;
  /** Exclusive: the first day AFTER the range. */
  toKey: string;
  label: string;
  /** Anchors for the previous and next range. */
  prevAt: string;
  nextAt: string;
  days: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = (key: string) => `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const key = (y: number, m: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;

export function parseFreq(raw: unknown): Freq {
  return typeof raw === 'string' && (FREQS as readonly string[]).includes(raw) ? (raw as Freq) : DEFAULT_FREQ;
}

/** A real calendar day in 2000..2100, else null. */
export function parseDateKey(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const y = Number(raw.slice(0, 4));
  return y >= 2000 && y <= 2100 && addDaysToDateKey(raw, 0) === raw ? raw : null;
}

function bounds(freq: Freq, at: string): { from: string; to: string } {
  const y = Number(at.slice(0, 4));
  const m = Number(at.slice(5, 7));
  switch (freq) {
    case 'day':
      return { from: at, to: addDaysToDateKey(at, 1) };
    case 'week': {
      const from = weekStartKey(at);
      return { from, to: addDaysToDateKey(from, 7) };
    }
    case 'month':
      return { from: key(y, m), to: m === 12 ? key(y + 1, 1) : key(y, m + 1) };
    case 'quarter': {
      const q = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: key(y, q), to: q === 10 ? key(y + 1, 1) : key(y, q + 3) };
    }
    case 'year':
      return { from: key(y, 1), to: key(y + 1, 1) };
  }
}

function labelFor(freq: Freq, from: string, to: string): string {
  const m = Number(from.slice(5, 7));
  switch (freq) {
    case 'day':
      return dmy(from);
    case 'week':
      return `${dmy(from)} – ${dmy(addDaysToDateKey(to, -1))}`;
    case 'month':
      return `${MONTHS[m - 1]} ${from.slice(0, 4)}`;
    case 'quarter':
      return `Q${Math.floor((m - 1) / 3) + 1} ${from.slice(0, 4)}`;
    case 'year':
      return from.slice(0, 4);
  }
}

/** The range for a frequency and an anchor day; a bad `at` becomes `todayKey`. */
export function resolveRange(input: { freq?: unknown; at?: unknown }, todayKey: string): KeyRange {
  const freq = parseFreq(input.freq);
  const at = parseDateKey(input.at) ?? todayKey;
  const { from, to } = bounds(freq, at);
  return {
    freq,
    at,
    fromKey: from,
    toKey: to,
    label: labelFor(freq, from, to),
    prevAt: bounds(freq, addDaysToDateKey(from, -1)).from,
    nextAt: to,
    days: Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000),
  };
}

/** R8 T4: the instant a factory-calendar day starts. Find the instant whose wall-clock in `timeZone` is that day 00:00: guess UTC midnight, measure how far the zone's reading is from it, shift back (twice, for a DST edge). */
export function factoryStartOfDay(y: number, m: number, d: number, timeZone: string): Date {
  const wanted = Date.UTC(y, m - 1, d);
  let guess = wanted;
  for (let i = 0; i < 2; i += 1) {
    const p = zonedParts(new Date(guess), timeZone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - seen;
  }
  return new Date(guess);
}

/** R8 T4: a half-open instant range from two factory date keys (`toKey` exclusive), the same cut as `factoryMonthRange`. */
export function factoryRangeFromKeys(fromKey: string, toKey: string, timeZone: string): { from: Date; to: Date } {
  const at = (k: string) => factoryStartOfDay(Number(k.slice(0, 4)), Number(k.slice(5, 7)), Number(k.slice(8, 10)), timeZone);
  return { from: at(fromKey), to: at(toKey) };
}
