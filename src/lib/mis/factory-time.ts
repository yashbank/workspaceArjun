/**
 * The factory's clock — pure, no Prisma, no React, no dependency (D22).
 *
 * THE RULE: never trust the server's local time. The database sits in one zone
 * (ap-southeast-1, UTC+8) and the plant in another (IST, UTC+5:30); a night-shift
 * punch at 06:20 IST is 08:50 on the server's wall clock, and any day or shift
 * derived from `getHours()` puts it on the wrong side of midnight — an error that
 * only surfaces in a payroll dispute weeks later.
 *
 * Instants stay instants (`Date`, `timestamptz`, UTC). Only *bucketing an instant
 * into a day or a minute-of-day* needs a zone, and it always comes from the
 * `factory.timezone` business rule, read on the server and passed in. There is no
 * default here that reads the environment: the fallback is a named constant, never
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`.
 *
 * Built on `Intl.DateTimeFormat`, which is in every runtime this project targets —
 * so no `date-fns-tz`, and §2's "no new dependencies" holds.
 */

/** The seeded value of the `factory.timezone` rule, and the fallback if it is unreadable or invalid. */
export const DEFAULT_FACTORY_TIMEZONE = 'Asia/Kolkata';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Is this an IANA zone the runtime knows? Guards the rule's value on write and on read. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const zone = value.trim();
  // A full IANA name (`Area/Location`) or `UTC`. `Intl` also accepts bare
  // abbreviations, and `IST` is India, Israel and Ireland — the one thing a
  // timezone rule must never be is ambiguous.
  if (!/^(UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(zone)) return false;
  try {
    formatterFor(zone);
    return true;
  } catch {
    return false;
  }
}

/** The zone to use given whatever the rule held — the rule's value if valid, else the seeded default. */
export function resolveFactoryTimezone(ruleValue: string | null | undefined): string {
  return isValidTimeZone(ruleValue) ? ruleValue.trim() : DEFAULT_FACTORY_TIMEZONE;
}

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

/** The wall-clock reading of an instant in a zone. */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(at)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute };
}

/** `2026-09-20` — the calendar day an instant falls on *in the factory*. */
export function factoryDateKey(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Minutes since midnight, on the factory's clock. */
export function factoryMinuteOfDay(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  return p.hour * 60 + p.minute;
}

/** `06:04` — how a person at the plant reads that instant. */
export function formatFactoryTime(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/**
 * `20/09/2026` — a day as the plant writes it, in the FACTORY's zone. Fixed format and zone on purpose: a client
 * component that formats with the browser's locale and zone (`toLocaleDateString()`) renders one string on the server and
 * another in the browser, and React throws a hydration error (F-26, /mis/settings/wages).
 */
export function formatFactoryDate(at: Date, timeZone: string): string {
  const key = factoryDateKey(at, timeZone);
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

/** `20/09/2026 06:04` — the day and the time, both the factory's. */
export function formatFactoryDateTime(at: Date, timeZone: string): string {
  return `${formatFactoryDate(at, timeZone)} ${formatFactoryTime(at, timeZone)}`;
}

/**
 * The date key `days` away from `key`. Pure calendar arithmetic on the date itself —
 * no zone is involved, so a daylight-saving edge can never skip or repeat a day.
 */
export function addDaysToDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function previousDateKey(key: string): string {
  return addDaysToDateKey(key, -1);
}

/**
 * The value to store in a `@db.Date` column for a date key: UTC midnight of that
 * date, which is exactly what Prisma writes as the date and what
 * `new Date('yyyy-MM-dd')` — how the existing attendance reads build their filter —
 * produces. Never a zoned midnight, which lands on the neighbouring UTC date.
 */
export function dateKeyToDbDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
