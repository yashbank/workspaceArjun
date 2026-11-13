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

// ---- --resume planning (pure) ------------------------------------------------------------------------------

/** Chunks whose rows reference only real, pre-existing rows (employees, shifts), never ids from earlier demo chunks. Only these may be re-built with fresh ids on resume. */
export const RESUME_SAFE_CHUNKS: readonly string[] = ['7-attendance', '8-payroll-period'];

export type ResumeChunkInput = { name: string; state: 'pending' | 'committed'; ids: Partial<Record<string, string[]>> };
/** table -> how many of the manifest ids for that table currently exist in the DB. */
export type ResumeFound = Record<string, number>;
export type ResumeDecision = { name: string; action: 'skip' | 'run' | 'rerun'; reason: string };

/**
 * Decide per planned chunk: skip (committed and every id present), run (not in manifest), rerun (pending and no
 * id exists: it never committed, so its manifest entry is replaced). Anything inconsistent is a blocker.
 */
export function planResume(
  plannedNames: readonly string[],
  manifestChunks: readonly ResumeChunkInput[],
  found: Record<string, ResumeFound>,
): { decisions: ResumeDecision[]; blockers: string[] } {
  const decisions: ResumeDecision[] = [];
  const blockers: string[] = [];
  for (const name of plannedNames) {
    const mc = manifestChunks.find((c) => c.name === name);
    if (!mc) {
      decisions.push({ name, action: 'run', reason: 'not in manifest' });
      continue;
    }
    const f = found[name] ?? {};
    const expected = Object.values(mc.ids).reduce((a, v) => a + (v?.length ?? 0), 0);
    const present = Object.keys(mc.ids).reduce((a, t) => a + (f[t] ?? 0), 0);
    if (mc.state === 'committed') {
      if (present === expected) decisions.push({ name, action: 'skip', reason: `committed, ${present}/${expected} rows verified` });
      else {
        decisions.push({ name, action: 'skip', reason: `committed but only ${present}/${expected} rows found` });
        blockers.push(`chunk ${name} is marked committed but only ${present}/${expected} manifest rows exist: investigate, do not resume`);
      }
    } else if (present === 0) {
      if (RESUME_SAFE_CHUNKS.includes(name)) decisions.push({ name, action: 'rerun', reason: `pending, 0/${expected} rows exist (never committed)` });
      else {
        decisions.push({ name, action: 'rerun', reason: 'pending, never committed' });
        blockers.push(`chunk ${name} is pending but not resume-safe (it references ids from earlier chunks): cannot rebuild with fresh ids`);
      }
    } else {
      decisions.push({ name, action: 'rerun', reason: `pending with ${present}/${expected} rows present` });
      blockers.push(`chunk ${name} is pending but ${present}/${expected} of its rows exist (partial): clean up manually, do not resume`);
    }
  }
  for (const mc of manifestChunks) {
    if (!plannedNames.includes(mc.name)) blockers.push(`manifest chunk ${mc.name} is not in this seeder's chunk list`);
  }
  return { decisions, blockers };
}
