/**
 * R2-222 - pure validation for a missed-punch regularization request. No Prisma, no React.
 * Days are `YYYY-MM-DD` keys, times are `HH:MM` on the factory clock.
 */

export const REGULARIZATION_REASON_MIN = 3;
export const REGULARIZATION_REASON_MAX = 300;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export type RegularizationInput = {
  workDate: string;
  requestedIn?: string | null;
  requestedOut?: string | null;
  reason: string;
};

export type RegularizationCheck =
  | { ok: true; workDate: string; requestedIn: string | null; requestedOut: string | null; reason: string }
  | { ok: false; error: string };

function isRealDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** `todayKey` is the factory's today (never the server's). Past days and today are fine; the future is not. */
export function validateRegularization(input: RegularizationInput, todayKey: string): RegularizationCheck {
  const workDate = (input.workDate ?? '').trim();
  if (!isRealDateKey(workDate)) return { ok: false, error: 'Date must look like 2026-10-13' };
  if (workDate > todayKey) return { ok: false, error: 'You cannot ask for a future date' };

  const requestedIn = input.requestedIn?.trim() || null;
  const requestedOut = input.requestedOut?.trim() || null;
  if (!requestedIn && !requestedOut) return { ok: false, error: 'Enter a clock-in time, a clock-out time, or both' };
  if (requestedIn && !TIME_OF_DAY.test(requestedIn)) return { ok: false, error: 'Clock-in time must look like 09:30' };
  if (requestedOut && !TIME_OF_DAY.test(requestedOut)) return { ok: false, error: 'Clock-out time must look like 18:30' };
  if (requestedIn && requestedOut && requestedOut <= requestedIn) return { ok: false, error: 'Clock-out must be after clock-in' };

  const reason = (input.reason ?? '').trim();
  if (reason.length < REGULARIZATION_REASON_MIN) return { ok: false, error: 'Give a reason (at least 3 characters)' };
  if (reason.length > REGULARIZATION_REASON_MAX) return { ok: false, error: `Reason must be ${REGULARIZATION_REASON_MAX} characters or fewer` };

  return { ok: true, workDate, requestedIn, requestedOut, reason };
}

export const REGULARIZATION_NOTE_MIN = 3;
