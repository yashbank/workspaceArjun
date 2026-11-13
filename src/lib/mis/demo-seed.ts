/**
 * Pure helpers for the go-live DEMO seed (`scripts/golive/seed-demo.ts`). No Prisma, no React, no clock.
 * Every calendar decision takes the factory zone explicitly (D22).
 */
import { addDaysToDateKey, zonedParts } from './factory-time';

export const DEMO_TAG = '[DEMO]';

/** `[DEMO] Sunrise Foods` — the visible tag in every text column the seeder writes. */
export function demoLabel(text: string): string {
  return `${DEMO_TAG} ${text}`;
}

export function isDemoTagged(value: string | null | undefined): boolean {
  return !!value && (value.startsWith(DEMO_TAG) || value.startsWith('DEMO-'));
}

/** The instant `HH:MM` on the factory day `dateKey` in `zone` (no server-local time involved). */
export function factoryInstant(dateKey: string, hhmm: string, zone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const p = zonedParts(new Date(utcMidnight), zone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const dayStart = utcMidnight - (asIfUtc - utcMidnight);
  return new Date(dayStart + (hh * 60 + mm) * 60_000);
}

export function isSundayKey(dateKey: string): boolean {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

/** The `count` factory days ending YESTERDAY, oldest first. */
export function lastDateKeys(todayKey: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count; i >= 1; i--) out.push(addDaysToDateKey(todayKey, -i));
  return out;
}

export type AttendanceScenario = 'NORMAL' | 'LATE' | 'HALF_DAY' | 'MISSED_OUT' | 'OVERTIME';

export type AttendanceDay = {
  status: 'PRESENT' | 'HALF_DAY';
  clockIn: Date;
  clockOut: Date | null;
  lateMinutes: number;
  otMinutes: number;
  notes: string | null;
};

function addMinutes(hhmm: string, delta: number): { dayOffset: number; hhmm: string } {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + delta;
  const dayOffset = Math.floor(total / 1440);
  const inDay = ((total % 1440) + 1440) % 1440;
  return { dayOffset, hhmm: `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}` };
}

/**
 * One attendance row for the day a shift STARTED on `dateKey`. A shift whose end is not after its start crosses
 * midnight, so its clock-out lands on the next calendar day (the row still belongs to the start day).
 */
export function buildAttendanceDay(input: {
  dateKey: string;
  shiftStart: string;
  shiftEnd: string;
  scenario: AttendanceScenario;
  zone: string;
}): AttendanceDay {
  const { dateKey, shiftStart, shiftEnd, scenario, zone } = input;
  const [sh, sm] = shiftStart.split(':').map(Number);
  const [eh, em] = shiftEnd.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const spanMin = endMin > startMin ? endMin - startMin : endMin + 1440 - startMin;
  const at = (offsetFromStart: number) => {
    const t = addMinutes(shiftStart, offsetFromStart);
    return factoryInstant(addDaysToDateKey(dateKey, t.dayOffset), t.hhmm, zone);
  };
  switch (scenario) {
    case 'LATE':
      return { status: 'PRESENT', clockIn: at(35), clockOut: at(spanMin + 3), lateMinutes: 35, otMinutes: 0, notes: '[DEMO] late arrival' };
    case 'HALF_DAY':
      return { status: 'HALF_DAY', clockIn: at(-2), clockOut: at(255), lateMinutes: 0, otMinutes: 0, notes: '[DEMO] half day' };
    case 'MISSED_OUT':
      return { status: 'PRESENT', clockIn: at(-3), clockOut: null, lateMinutes: 0, otMinutes: 0, notes: '[DEMO] missed out punch' };
    case 'OVERTIME':
      return { status: 'PRESENT', clockIn: at(-3), clockOut: at(spanMin + 150), lateMinutes: 0, otMinutes: 150, notes: '[DEMO] overtime' };
    default:
      return { status: 'PRESENT', clockIn: at(-4), clockOut: at(spanMin + 6), lateMinutes: 0, otMinutes: 0, notes: null };
  }
}

export type SampleSlot = 'DAY' | 'NIGHT' | 'GENERAL' | 'LADIES' | 'HOUSEKEEPING';

/** Real shift names (MisShift.name) each slot is drawn from. */
export const SAMPLE_SLOT_SHIFT_NAME: Record<SampleSlot, string> = {
  DAY: 'Day Shift',
  NIGHT: 'Night Shift',
  GENERAL: 'General Shift',
  LADIES: 'General Ladies',
  HOUSEKEEPING: 'House Keeping',
};

/** Which scenario each sample employee gets on their n-th working day (cases first, NORMAL after). */
export const ATTENDANCE_SCRIPT: Record<SampleSlot, AttendanceScenario[]> = {
  DAY: ['NORMAL', 'LATE', 'NORMAL', 'HALF_DAY', 'NORMAL', 'NORMAL'],
  NIGHT: ['NORMAL', 'NORMAL', 'OVERTIME', 'NORMAL', 'MISSED_OUT', 'NORMAL'],
  GENERAL: ['NORMAL', 'NORMAL', 'LATE', 'NORMAL', 'NORMAL', 'NORMAL'],
  LADIES: ['NORMAL', 'HALF_DAY', 'NORMAL', 'NORMAL', 'NORMAL', 'LATE'],
  HOUSEKEEPING: ['MISSED_OUT', 'NORMAL', 'NORMAL', 'NORMAL', 'LATE', 'NORMAL'],
};

export type EmployeeLite = {
  name?: string;
  id: string;
  employeeCode: string;
  defaultShiftId: string | null;
  wageTypeCode: string | null;
  userProfileId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
};

/**
 * One real client employee (EMP101 and up) per shift slot: active, on that shift by default, no wage code (so the
 * existing default daily wage rule applies), preferring someone with no login, then the lowest code.
 */
export function pickSampleEmployees(
  employees: EmployeeLite[],
  shiftIdBySlot: Record<SampleSlot, string | undefined>,
): Partial<Record<SampleSlot, EmployeeLite>> {
  const out: Partial<Record<SampleSlot, EmployeeLite>> = {};
  const num = (e: EmployeeLite) => {
    const m = /^EMP(\d+)$/.exec(e.employeeCode);
    return m ? Number(m[1]) : -1;
  };
  for (const slot of Object.keys(shiftIdBySlot) as SampleSlot[]) {
    const shiftId = shiftIdBySlot[slot];
    if (!shiftId) continue;
    const pool = employees
      .filter((e) => e.isActive && !e.deletedAt && num(e) >= 101 && e.defaultShiftId === shiftId && !e.wageTypeCode)
      .sort((a, b) => Number(!!a.userProfileId) - Number(!!b.userProfileId) || num(a) - num(b));
    if (pool[0]) out[slot] = pool[0];
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Running balance after each movement, per item, in the order given. */
export function runningBalances(moves: { itemId: string; change: number }[]): number[] {
  const bal = new Map<string, number>();
  return moves.map((m) => {
    const next = r2((bal.get(m.itemId) ?? 0) + m.change);
    bal.set(m.itemId, next);
    return next;
  });
}
