/** Calendar date as YYYY-MM-DD in the browser's local timezone. */
export function localDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(dateStr: string): [number, number, number] {
  const parts = dateStr.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error('Invalid date');
  }
  return parts as [number, number, number];
}

/**
 * Convert a calendar day (YYYY-MM-DD) to UTC bounds using the client's
 * `Date.getTimezoneOffset()` convention (minutes to add to local time to get UTC).
 */
export function calendarDayToUtc(
  dateStr: string,
  endOfDay: boolean,
  tzOffsetMinutes: number,
): Date {
  const [y, m, d] = parseYmd(dateStr);
  const h = endOfDay ? 23 : 0;
  const min = endOfDay ? 59 : 0;
  const sec = endOfDay ? 59 : 0;
  const ms = endOfDay ? 999 : 0;
  const utcMs = Date.UTC(y, m - 1, d, h, min, sec, ms) + tzOffsetMinutes * 60 * 1000;
  return new Date(utcMs);
}

export function defaultActivityFromDate(tzOffsetMinutes?: number): Date {
  const now = new Date();
  if (typeof tzOffsetMinutes === 'number' && !Number.isNaN(tzOffsetMinutes)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return calendarDayToUtc(localDateInputValue(d), false, tzOffsetMinutes);
  }
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse YYYY-MM-DD; end date includes full local day through 23:59:59.999 in client TZ. */
export function parseActivityDateRange(
  from?: string,
  to?: string,
  tzOffsetMinutes?: number,
): { from: Date; to: Date } {
  const useTz = typeof tzOffsetMinutes === 'number' && !Number.isNaN(tzOffsetMinutes);

  const parseDay = (dateStr: string, endOfDay: boolean): Date => {
    if (useTz) return calendarDayToUtc(dateStr, endOfDay, tzOffsetMinutes!);
    const [y, m, d] = parseYmd(dateStr);
    if (endOfDay) return new Date(y, m - 1, d, 23, 59, 59, 999);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  };

  const fromDate = from ? parseDay(from, false) : defaultActivityFromDate(tzOffsetMinutes);
  const toDate = to
    ? parseDay(to, true)
    : useTz
      ? calendarDayToUtc(localDateInputValue(), true, tzOffsetMinutes!)
      : (() => {
          const end = new Date();
          end.setHours(23, 59, 59, 999);
          return end;
        })();

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('Invalid date range');
  }

  return { from: fromDate, to: toDate };
}

/** True when `createdAt` falls on the given local calendar day (client TZ). */
export function isCreatedOnLocalDay(
  createdAt: Date,
  dayYmd: string,
  tzOffsetMinutes: number,
): boolean {
  const { from, to } = parseActivityDateRange(dayYmd, dayYmd, tzOffsetMinutes);
  return createdAt >= from && createdAt <= to;
}
