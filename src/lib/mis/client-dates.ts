/**
 * Date text for CLIENT components that render on the server first.
 *
 * `toLocaleDateString('en-IN')` with no `timeZone` uses the machine's zone: UTC on the server,
 * IST in the browser — so the two renders disagree and React throws hydration error #418 on
 * every store, audit, order, production and QC screen (found by the coverage suite). Pinning
 * the zone makes both sides produce the same text. Same `en-IN` formats the screens already used.
 *
 * shortcut: the zone is the DEFAULT factory zone, not the business-rule value (D22) — client
 * components have no server round trip for it; upgrade to a prop if a factory ever moves zone.
 *
 * Pure: no Prisma, no React.
 */
import { DEFAULT_FACTORY_TIMEZONE, zonedParts } from './factory-time';

type DateLike = Date | string | number;
const toDate = (d: DateLike) => (d instanceof Date ? d : new Date(d));
const TZ = { timeZone: DEFAULT_FACTORY_TIMEZONE } as const;

/** `toLocaleDateString('en-IN', opts)` in the factory zone. */
export function fmtDate(d: DateLike, opts: Intl.DateTimeFormatOptions = {}): string {
  return toDate(d).toLocaleDateString('en-IN', { ...TZ, ...opts });
}

/** `toLocaleTimeString('en-IN', opts)` in the factory zone. */
export function fmtTime(d: DateLike, opts: Intl.DateTimeFormatOptions = {}): string {
  return toDate(d).toLocaleTimeString('en-IN', { ...TZ, ...opts });
}

/** `toLocaleString('en-IN', opts)` in the factory zone. */
export function fmtDateTime(d: DateLike, opts: Intl.DateTimeFormatOptions = {}): string {
  return toDate(d).toLocaleString('en-IN', { ...TZ, ...opts });
}

/** The hour (0–23) in the factory zone — `getHours()` would be the machine's zone. */
export function factoryHour(d: DateLike): number {
  return zonedParts(toDate(d), DEFAULT_FACTORY_TIMEZONE).hour;
}
