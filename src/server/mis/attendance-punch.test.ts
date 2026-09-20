import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { newIdempotencyKey } from '@/lib/mis/offline/idempotency';

import { createFakeDb } from './offline-fake-db';

/**
 * Punch ingestion (Phase 13; Appendix B, D15, D18, D20, D21, D22).
 *
 * Every instant is built from an IST wall-clock reading and "now" is pinned, so
 * these read the same on a UTC, an IST or a UTC+8 machine. The database is the
 * in-memory fake — it stages a transaction and commits or discards it whole, and it
 * refuses to update or delete a punch exactly as the real trigger does.
 */

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const fake = createFakeDb();
vi.mock('@/server/db', () => ({ db: fake.db }));

const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const authenticateDevice = vi.fn();
const recordDeviceSync = vi.fn();
vi.mock('@/server/mis/kiosk-device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./kiosk-device')>();
  return {
    ...actual,
    authenticateDevice: (...a: unknown[]) => authenticateDevice(...a),
    recordDeviceSync: (...a: unknown[]) => recordDeviceSync(...a),
  };
});

const { ingestDevicePunch, submitPunch } = await import('./attendance-punch');
const { KioskDeviceError } = await import('./kiosk-device');

const IST_OFFSET_MS = 330 * 60_000;
/** An IST wall-clock reading → the instant. */
const ist = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 8, day, h, m) - IST_OFFSET_MS);
const NOW = ist(21, 7, 41); // the tablet finds signal at 07:41 on the 21st

const DEVICE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_DEVICE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OPERATOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER = '11111111-1111-4111-8111-111111111111';
const S1 = '51111111-1111-4111-8111-111111111111';
const S2 = '52222222-2222-4222-8222-222222222222';
const NIGHT = '53333333-3333-4333-8333-333333333333';

function punchBody(kind: 'in' | 'out', when: Date, payload: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    key: newIdempotencyKey(),
    kind: kind === 'in' ? 'attendance.punch_in' : 'attendance.punch_out',
    payload: { badgeCode: 'BPP-0142', ...payload },
    clientRecordedAt: when.toISOString(),
    ...extra,
  };
}

const hhmm = (d: Date) => d.toISOString();
const rowFor = (dateKey: string) => fake.state.attendance.find((a) => (a.date as Date).toISOString().startsWith(dateKey));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);

  fake.state.queued.clear();
  fake.state.punches = [];
  fake.state.attendance = [];
  fake.state.employees = [
    { id: 'e1', employeeCode: 'BPP-0142', name: 'Ramesh Kumar', isActive: true, deletedAt: null },
    { id: 'e2', employeeCode: 'BPP-0001', name: 'Left Company', isActive: false, deletedAt: null },
    { id: 'e3', employeeCode: 'BPP-0002', name: 'Deleted Person', isActive: true, deletedAt: new Date() },
  ];
  fake.state.shifts = [
    { id: S1, name: 'Shift 1', startTime: '06:00', endTime: '14:00', isActive: true },
    { id: S2, name: 'Shift 2', startTime: '14:00', endTime: '22:00', isActive: true },
    { id: NIGHT, name: 'Night', startTime: '22:00', endTime: '06:00', isActive: true },
  ];
  fake.state.rules['factory.timezone'] = 'Asia/Kolkata';
  fake.state.rules['ATTENDANCE_CORRECTION_DAYS'] = '3';
  fake.state.rules['offline.clock_skew_minutes'] = '15';
  fake.state.rules['offline.max_queue_age_hours'] = '72';
  fake.hooks.failOn = undefined;

  authenticateDevice.mockResolvedValue({ id: DEVICE, name: 'GATE-01', revoked: false });
  getCurrentUser.mockResolvedValue({ id: USER });
  getMisRole.mockResolvedValue('ATTENDANCE_OPERATOR');
});
afterEach(() => vi.useRealTimers());

const send = (body: unknown) => ingestDevicePunch('Bearer mkd_x', body);

describe('D15 — a punch carries the DEVICE’S time, in both directions', () => {
  it('a 06:04 punch that syncs at 07:41 IS a 06:04 punch (K2) — not a 07:41 one', async () => {
    const at = ist(21, 6, 4);
    const out = await send(punchBody('in', at));

    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.punches).toHaveLength(1);
    expect(hhmm(fake.state.punches[0].punchedAt as Date)).toBe(hhmm(at));
    expect(hhmm(fake.state.punches[0].punchedAt as Date)).not.toBe(hhmm(NOW));
    // …and the attendance day carries that same 06:04, so nobody who arrived at six is late for a slow sync.
    expect(hhmm(rowFor('2026-09-21')!.clockIn as Date)).toBe(hhmm(at));
  });

  it('a device clock AHEAD beyond tolerance PARKS — it is never clamped to now()', async () => {
    const ahead = new Date(NOW.getTime() + 60 * 60_000); // an hour in the future
    const body = punchBody('in', ahead);

    const out = await send(body);

    expect(out).toMatchObject({ outcome: 'PARKED', reason: 'CLOCK_SKEW' });
    expect(fake.state.punches).toHaveLength(0); // not applied…
    expect(fake.state.attendance).toHaveLength(0);
    const parked = fake.state.queued.get(body.key)!; // …not dropped…
    expect(parked.status).toBe('PARKED');
    expect(hhmm(parked.clientRecordedAt as Date)).toBe(hhmm(ahead)); // …and the raw claim kept as evidence, not snapped to now
    expect((parked.payload as { badgeCode: string }).badgeCode).toBe('BPP-0142');
  });

  it('a device clock slightly ahead but WITHIN tolerance is accepted exactly as claimed — not rounded to now', async () => {
    const slightlyAhead = new Date(NOW.getTime() + 5 * 60_000);
    const out = await send(punchBody('in', slightlyAhead));
    expect(out.outcome).toBe('APPLIED');
    expect(hhmm(fake.state.punches[0].punchedAt as Date)).toBe(hhmm(slightlyAhead));
  });

  it('a punch older than the queue’s age limit PARKS as TOO_OLD — never dropped, never applied', async () => {
    const body = punchBody('in', new Date(NOW.getTime() - 100 * 3_600_000));
    const out = await send(body);
    expect(out).toMatchObject({ outcome: 'PARKED', reason: 'TOO_OLD' });
    expect(fake.state.punches).toHaveLength(0);
    expect(fake.state.queued.get(body.key)!.status).toBe('PARKED');
  });

  it('the tolerance is a business rule: widening it lets the same punch through with no code change', async () => {
    const ahead = new Date(NOW.getTime() + 60 * 60_000);
    fake.state.rules['offline.clock_skew_minutes'] = '90';
    expect((await send(punchBody('in', ahead))).outcome).toBe('APPLIED');
  });
});

// Racing replays are settled by the key's primary key and proven in idempotency.test.ts; what the punch
// path adds is that its business rows commit or roll back WITH the key, which is what the crash test proves.
describe('exactly once (Appendix B §B.7)', () => {
  it('the same punch sent five times creates ONE punch and rebuilds the day ONCE', async () => {
    const body = punchBody('in', ist(21, 6, 4));
    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push(await send(body));

    expect(outcomes.map((o) => o.outcome)).toEqual(['APPLIED', 'DUPLICATE', 'DUPLICATE', 'DUPLICATE', 'DUPLICATE']);
    expect(fake.state.punches).toHaveLength(1);
    expect(fake.state.attendance).toHaveLength(1);
    // A duplicate is answered with the ORIGINAL result, not an error.
    expect(new Set(outcomes.map((o) => o.result?.punchId)).size).toBe(1);
  });

  it('a crash after the punch but before the day is written leaves NO punch and NO key — the retry lands once', async () => {
    const body = punchBody('in', ist(21, 6, 4));
    fake.hooks.failOn = 'attendance.write';

    const first = await send(body);
    expect(first.outcome).toBe('RETRY');
    expect(fake.state.punches).toHaveLength(0); // rolled back with the key
    expect(fake.state.queued.get(body.key)?.status).not.toBe('APPLIED');

    const second = await send(body);
    expect(second.outcome).toBe('APPLIED');
    expect(fake.state.punches).toHaveLength(1);
  });
});

describe('out of order — the day is derived, so arrival order cannot matter (D20)', () => {
  it('a clock-OUT that arrives before its clock-IN rebuilds ONE day, not two', async () => {
    await send(punchBody('out', ist(20, 14, 2)));
    expect(fake.state.attendance).toHaveLength(1);
    expect(rowFor('2026-09-20')!.clockIn).toBeNull();

    await send(punchBody('in', ist(20, 6, 4)));

    expect(fake.state.attendance).toHaveLength(1);
    const day = rowFor('2026-09-20')!;
    expect([hhmm(day.clockIn as Date), hhmm(day.clockOut as Date)]).toEqual([hhmm(ist(20, 6, 4)), hhmm(ist(20, 14, 2))]);
  });

  it('a night shift is ONE day filed under the evening it started (22:05 → 06:20 next morning)', async () => {
    await send(punchBody('in', ist(20, 22, 5)));
    await send(punchBody('out', ist(21, 6, 20)));

    expect(fake.state.attendance).toHaveLength(1);
    expect((fake.state.attendance[0].date as Date).toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(fake.state.attendance[0].shiftId).toBe(NIGHT);
  });

  it('THE ORPHAN: a night clock-out that arrives first is VACATED from the wrong day when its clock-in arrives', async () => {
    await send(punchBody('out', ist(21, 6, 20))); // arrives first, no partner yet
    const rowsBefore = fake.state.attendance.map((a) => (a.date as Date).toISOString().slice(0, 10));
    expect(rowsBefore).toHaveLength(1);

    await send(punchBody('in', ist(20, 22, 5)));

    expect(fake.state.attendance).toHaveLength(1); // the orphan's row is gone, not left behind
    expect((fake.state.attendance[0].date as Date).toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(fake.state.attendance[0].clockIn).not.toBeNull();
    expect(fake.state.attendance[0].clockOut).not.toBeNull();
  });

  it('the tablet’s shift hint stops a 05:50 day-shift arrival being filed as last night’s (D22)', async () => {
    await send(punchBody('in', ist(21, 5, 50), { shiftId: S1 }));
    expect((fake.state.attendance[0].date as Date).toISOString().slice(0, 10)).toBe('2026-09-21');
  });

  it('ignores a shift hint that names no real shift, rather than trusting it', async () => {
    const out = await send(punchBody('in', ist(21, 6, 4), { shiftId: '99999999-9999-4999-8999-999999999999' }));
    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.punches[0].shiftId).toBeNull();
  });

  it('a superseded punch is ignored: the correction, not the original, decides the day (D21)', async () => {
    // The original scan said 06:00; it was corrected to 06:40. If the original still counted, the
    // earliest-clock-in rule would pick 06:00 — so this only passes if superseded punches are excluded.
    fake.state.punches.push(
      { id: 'orig', employeeId: 'e1', direction: 'IN', punchedAt: ist(21, 6, 0), shiftId: null, supersedesId: null, idempotencyKey: newIdempotencyKey() },
      { id: 'fix', employeeId: 'e1', direction: 'IN', punchedAt: ist(21, 6, 40), shiftId: null, supersedesId: 'orig', idempotencyKey: newIdempotencyKey() },
    );
    await send(punchBody('out', ist(21, 7, 30)));
    expect(hhmm(rowFor('2026-09-21')!.clockIn as Date)).toBe(hhmm(ist(21, 6, 40)));
  });
});

describe('THE FACTORY ZONE DECIDES THE DAY, NOT THE SERVER (D22)', () => {
  it('the factory.timezone rule is what is read: the same 05:50 IST punch files under a different day in another zone', async () => {
    // 05:50 IST on the 21st: inside the night window that ends 06:00 → last night's day (the 20th).
    await send(punchBody('out', ist(21, 5, 50)));
    expect((fake.state.attendance[0].date as Date).toISOString().slice(0, 10)).toBe('2026-09-20');

    // The same instant on a UTC+8 clock is 08:20 — Shift 1, the 21st. Proof the RULE, not the machine, decides.
    fake.state.attendance = [];
    fake.state.punches = [];
    fake.state.queued.clear();
    fake.state.rules['factory.timezone'] = 'Asia/Singapore';
    await send(punchBody('out', ist(21, 5, 50)));
    expect((fake.state.attendance[0].date as Date).toISOString().slice(0, 10)).toBe('2026-09-21');
  });

  it('an invalid stored zone falls back to Asia/Kolkata — never to the server’s clock', async () => {
    fake.state.rules['factory.timezone'] = 'IST';
    await send(punchBody('out', ist(21, 5, 50)));
    expect((fake.state.attendance[0].date as Date).toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it.each(['src/lib/mis/attendance-day.ts', 'src/lib/mis/shift-window.ts', 'src/server/mis/attendance-punch.ts'])(
    '%s never reads the server’s local time',
    (file) => {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
        .join('\n');
      expect(source).not.toMatch(/\.(getHours|setHours|getMinutes|getDate|getDay|getMonth|getFullYear|toLocale\w*String)\(/);
      expect(source).not.toMatch(/resolvedOptions\(\)\.timeZone/);
    },
  );
});

describe('what parks instead of applying (D21) — each needs a person', () => {
  it('an unknown badge PARKS with the scan time and the code, and creates no punch (K2)', async () => {
    const body = punchBody('in', ist(21, 6, 47), { badgeCode: 'bpp-8841' });
    const out = await send(body);

    expect(out).toMatchObject({ outcome: 'PARKED', reason: 'BADGE_UNKNOWN' });
    expect(out.detail).toMatch(/06:47/); // the time on the FACTORY's clock
    expect(out.detail).toMatch(/BPP-8841/);
    expect(fake.state.punches).toHaveLength(0);
    expect((fake.state.queued.get(body.key)!.payload as { badgeCode: string }).badgeCode).toBe('bpp-8841');
  });

  it('a person no longer on the roll PARKS as EMPLOYEE_INACTIVE; so does a soft-deleted one', async () => {
    expect(await send(punchBody('in', ist(21, 6, 4), { badgeCode: 'BPP-0001' }))).toMatchObject({ outcome: 'PARKED', reason: 'EMPLOYEE_INACTIVE' });
    expect(await send(punchBody('in', ist(21, 6, 4), { badgeCode: 'BPP-0002' }))).toMatchObject({ outcome: 'PARKED', reason: 'EMPLOYEE_INACTIVE' });
    expect(fake.state.punches).toHaveLength(0);
  });

  it('a punch for a day past the correction window PARKS for the Super Attendance Operator — not applied, not dropped', async () => {
    fake.state.rules['offline.max_queue_age_hours'] = '720'; // so the age limit is not what stops it
    const body = punchBody('in', ist(17, 9, 0)); // four days back; the window is three
    const out = await send(body);

    expect(out).toMatchObject({ outcome: 'PARKED', reason: 'CORRECTION_WINDOW_CLOSED' });
    expect(fake.state.punches).toHaveLength(0);
    expect(fake.state.attendance).toHaveLength(0); // a closed day is not silently rewritten
    expect(fake.state.queued.get(body.key)!.status).toBe('PARKED');
  });

  it('…while the last day inside the window still applies', async () => {
    fake.state.rules['offline.max_queue_age_hours'] = '720';
    expect((await send(punchBody('in', ist(19, 9, 0)))).outcome).toBe('APPLIED');
  });

  it('the window is the ATTENDANCE_CORRECTION_DAYS rule, not a constant', async () => {
    fake.state.rules['offline.max_queue_age_hours'] = '720';
    fake.state.rules['ATTENDANCE_CORRECTION_DAYS'] = '7';
    expect((await send(punchBody('in', ist(17, 9, 0)))).outcome).toBe('APPLIED');
  });

  it.each([
    ['a missing badge', { badgeCode: '' }],
    ['a non-string badge', { badgeCode: 42 }],
    ['an invalid operator id', { operatorId: 'not-a-uuid' }],
    ['an invalid shift id', { shiftId: 'nope' }],
  ])('REJECTS %s — the entry itself is wrong', async (_label, payload) => {
    const out = await send(punchBody('in', ist(21, 6, 4), payload));
    expect(out).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
    expect(fake.state.punches).toHaveLength(0);
  });

  it('REJECTS a key that is not a UUID, a kind that is not a punch, and an unreadable time', async () => {
    expect(await send({ ...punchBody('in', ist(21, 6, 4)), key: 'abc' })).toMatchObject({ outcome: 'REJECTED', reason: 'BAD_KEY' });
    expect(await send({ ...punchBody('in', ist(21, 6, 4)), kind: 'production.log' })).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
    expect(await send({ ...punchBody('in', ist(21, 6, 4)), clientRecordedAt: 'yesterday-ish' })).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
    expect(await send(null)).toMatchObject({ outcome: 'REJECTED' });
    expect(fake.state.punches).toHaveLength(0);
  });
});

describe('a day a person edited by hand is theirs (D20)', () => {
  it('the punch is recorded, the day is NOT touched, and the result says why', async () => {
    fake.state.attendance.push({
      id: 'att-hand',
      employeeId: 'e1',
      date: new Date('2026-09-21T00:00:00Z'),
      status: 'HALF_DAY',
      clockIn: ist(21, 9, 0),
      clockOut: null,
      shiftId: null,
      editedAt: new Date('2026-09-21T03:00:00Z'),
      approvedOut: false,
      lateMinutes: 12,
      otMinutes: 0,
      notes: 'Came in late, agreed with supervisor',
    });

    const out = await send(punchBody('in', ist(21, 6, 4)));

    expect(out.outcome).toBe('APPLIED');
    expect(out.result).toMatchObject({ dayRebuilt: false, dayHeld: 'EDITED_BY_HAND' });
    expect(fake.state.punches).toHaveLength(1); // the fact is kept
    expect(hhmm(fake.state.attendance[0].clockIn as Date)).toBe(hhmm(ist(21, 9, 0))); // the person’s decision stands
    expect(fake.state.attendance[0].status).toBe('HALF_DAY');
  });
});

describe('lateness and overtime are NOT computed here (D20 — Phase 19)', () => {
  it('a very late arrival creates a day with lateMinutes and otMinutes exactly 0', async () => {
    await send(punchBody('in', ist(20, 6, 0), { shiftId: S1 }));
    await send(punchBody('out', ist(20, 22, 0), { shiftId: S1 })); // 16h on an 8h shift: hours of "overtime"
    const day = rowFor('2026-09-20')!;
    expect(day.lateMinutes).toBe(0);
    expect(day.otMinutes).toBe(0);
  });

  it('never overwrites a lateness or overtime someone else recorded on a day it updates', async () => {
    fake.state.attendance.push({
      id: 'att-1',
      employeeId: 'e1',
      date: new Date('2026-09-21T00:00:00Z'),
      status: 'LATE',
      clockIn: null,
      clockOut: null,
      shiftId: null,
      editedAt: null,
      approvedOut: false,
      lateMinutes: 25,
      otMinutes: 40,
      notes: null,
    });
    await send(punchBody('in', ist(21, 6, 25)));
    expect(fake.state.attendance[0]).toMatchObject({ lateMinutes: 25, otMinutes: 40, status: 'LATE' }); // status not reset either
    expect(fake.state.attendance[0].clockIn).not.toBeNull();
  });

  it('turning up does turn an ABSENT day present', async () => {
    fake.state.attendance.push({
      id: 'att-2', employeeId: 'e1', date: new Date('2026-09-21T00:00:00Z'), status: 'ABSENT', clockIn: null, clockOut: null,
      shiftId: null, editedAt: null, approvedOut: false, lateMinutes: 0, otMinutes: 0, notes: null,
    });
    await send(punchBody('in', ist(21, 6, 4)));
    expect(fake.state.attendance[0].status).toBe('PRESENT');
  });
});

describe('the tablet door — a device token, and only that (D18)', () => {
  it('refuses an unauthenticated caller BEFORE reading the body or touching any table', async () => {
    authenticateDevice.mockRejectedValue(new KioskDeviceError('UNAUTHORIZED', 'Not authorised.'));
    await expect(ingestDevicePunch(null, punchBody('in', ist(21, 6, 4)))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fake.state.queued.size).toBe(0);
    expect(fake.state.punches).toHaveLength(0);
  });

  it('asks the gate to ACCEPT a retired tablet (allowRevoked) — a punch is real even if the tablet is retired', async () => {
    await send(punchBody('in', ist(21, 6, 4)));
    expect(authenticateDevice).toHaveBeenCalledWith('Bearer mkd_x', { allowRevoked: true });
  });

  it('a retired tablet’s punch LANDS, flagged, and does not refresh its health', async () => {
    authenticateDevice.mockResolvedValue({ id: DEVICE, name: 'GATE-OLD', revoked: true });
    const out = await send(punchBody('in', ist(21, 6, 4)));

    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.punches[0].fromRevokedDevice).toBe(true);
    expect(recordDeviceSync).not.toHaveBeenCalled();
  });

  it('attributes the punch to the device the TOKEN names — never to one the body claims', async () => {
    const body = punchBody('in', ist(21, 6, 4), {}, { deviceId: OTHER_DEVICE });
    await send(body);
    expect(fake.state.punches[0].deviceId).toBe(DEVICE);
    expect(fake.state.queued.get(body.key)!.deviceId).toBe(DEVICE); // the dedupe row too
    expect(fake.state.punches[0].recordedById).toBeNull();
  });

  it('records the operator who confirmed the face when one is sent, and does not require one yet (D21)', async () => {
    await send(punchBody('in', ist(21, 6, 4), { operatorId: OPERATOR }));
    expect(fake.state.punches[0].operatorId).toBe(OPERATOR);
    await send(punchBody('out', ist(20, 14, 0)));
    expect(fake.state.punches).toHaveLength(2);
    expect(fake.state.punches.find((p) => p.direction === 'OUT')!.operatorId).toBeNull();
  });

  it('records a successful sync with the tablet’s own health report — but not when the server asked it to retry', async () => {
    await send({ ...punchBody('in', ist(21, 6, 4)), health: { batteryPercent: 38, isCharging: false, queuedPunches: 13, junk: 'x' } });
    expect(recordDeviceSync).toHaveBeenCalledTimes(1);
    expect(recordDeviceSync.mock.calls[0][1]).toEqual({ batteryPercent: 38, isCharging: false, queuedPunches: 13 });

    recordDeviceSync.mockClear();
    fake.hooks.failOn = 'attendance.write';
    expect((await send(punchBody('in', ist(20, 9, 0)))).outcome).toBe('RETRY');
    expect(recordDeviceSync).not.toHaveBeenCalled();
  });

  it('a parked punch still counts as contact — the tablet is alive and its queue is draining', async () => {
    await send(punchBody('in', ist(21, 6, 47), { badgeCode: 'BPP-8841' }));
    expect(recordDeviceSync).toHaveBeenCalledTimes(1);
  });

  it('audits an applied punch with no actor and the device, and nothing money-shaped', async () => {
    await send(punchBody('in', ist(21, 6, 4)));
    expect(audit).toHaveBeenCalledTimes(1);
    const entry = audit.mock.calls[0][0];
    expect(entry).toMatchObject({ actorId: null, action: 'ATTENDANCE_PUNCH', entity: 'MisAttendancePunch' });
    expect(entry.after.deviceId).toBe(DEVICE);
    expect(JSON.stringify(entry)).not.toMatch(/wage|salary|rate|pay/i);
  });

  it('audits nothing for a parked or duplicate punch — nothing happened', async () => {
    await send(punchBody('in', ist(21, 6, 47), { badgeCode: 'BPP-8841' }));
    const body = punchBody('in', ist(21, 6, 4));
    await send(body);
    audit.mockClear();
    await send(body); // duplicate
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('the portal door — a signed-in user (submitPunch)', () => {
  const envelope = (over: Record<string, unknown> = {}) => ({ ...punchBody('in', ist(21, 6, 4)), queuedBy: USER, ...over }) as Parameters<typeof submitPunch>[0];

  it('records the punch against the user, not a device', async () => {
    const out = await submitPunch(envelope());
    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.punches[0]).toMatchObject({ recordedById: USER, deviceId: null, fromRevokedDevice: false });
  });

  it('a signed-out browser gets RETRY, not a park — a missing session is not a withdrawn right', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await submitPunch(envelope())).outcome).toBe('RETRY');
    expect(fake.state.punches).toHaveLength(0);
  });

  it('parks a punch queued by someone else — it is never re-attributed to whoever is signed in at sync', async () => {
    const out = await submitPunch(envelope({ queuedBy: '22222222-2222-4222-8222-222222222222' }));
    expect(out).toMatchObject({ outcome: 'PARKED', reason: 'FORBIDDEN' });
    expect(fake.state.punches).toHaveLength(0);
  });

  it.each(['SUPERVISOR', 'QC', 'STORE_GUY', 'WORKER'])('parks a punch from %s — attendance.write withdrawn or never held', async (role) => {
    getMisRole.mockResolvedValue(role);
    const out = await submitPunch(envelope());
    expect(out).toMatchObject({ outcome: 'PARKED', reason: 'FORBIDDEN' });
    expect(fake.state.punches).toHaveLength(0);
  });

  it('a LIVE refusal records nothing, so fixing the cause and tapping again works (§B.10.1)', async () => {
    fake.state.rules['offline.max_queue_age_hours'] = '720';
    const body = envelope({ ...punchBody('in', ist(17, 9, 0)) });
    const out = await submitPunch(body, { live: true });
    expect(out).toMatchObject({ outcome: 'PARKED', reason: 'CORRECTION_WINDOW_CLOSED' });
    expect(fake.state.queued.size).toBe(0);
  });

  it('shares the tablet door’s dedupe: the same key from either door is one punch', async () => {
    const body = punchBody('in', ist(21, 6, 4));
    await send(body);
    const out = await submitPunch({ ...body, queuedBy: USER } as Parameters<typeof submitPunch>[0]);
    expect(out.outcome).toBe('DUPLICATE');
    expect(fake.state.punches).toHaveLength(1);
  });
});

describe('K2’s Fix: re-record an unrecognised badge for the right person, and close the held entry', () => {
  const heldUnknown = async () => {
    const body = punchBody('in', ist(21, 6, 47), { badgeCode: 'BPP-8841' });
    const out = await send(body);
    expect(out).toMatchObject({ outcome: 'PARKED', reason: 'BADGE_UNKNOWN' });
    return body;
  };

  it('the correction lands as a NEW punch at the ORIGINAL scan time, and the held entry is marked resolved — not left dangling', async () => {
    const held = await heldUnknown();

    const fix = punchBody('in', ist(21, 6, 47), { badgeCode: 'BPP-0142', correctsKey: held.key });
    const out = await send(fix);

    expect(out.outcome).toBe('APPLIED');
    expect(hhmm(fake.state.punches[0].punchedAt as Date)).toBe(hhmm(ist(21, 6, 47))); // 06:47 stays 06:47 (D15)
    const closed = fake.state.queued.get(held.key)!;
    expect(closed.resolvedAt).toBeInstanceOf(Date);
    expect(closed.resolutionNote).toMatch(/Ramesh Kumar/);
    expect(closed.status).toBe('PARKED'); // the record is never rewritten — only annotated as resolved
  });

  it('cannot close another tablet’s held entry — scoped to the device that made it', async () => {
    const held = await heldUnknown();
    authenticateDevice.mockResolvedValue({ id: OTHER_DEVICE, name: 'GATE-02', revoked: false });

    await send(punchBody('in', ist(21, 6, 47), { badgeCode: 'BPP-0142', correctsKey: held.key }));

    expect(fake.state.queued.get(held.key)!.resolvedAt ?? null).toBeNull();
  });

  it('cannot close a park that needs a person’s judgement — only an unrecognised badge', async () => {
    const skewed = punchBody('in', new Date(NOW.getTime() + 60 * 60_000));
    expect((await send(skewed)).outcome).toBe('PARKED');

    await send(punchBody('in', ist(21, 6, 4), { correctsKey: skewed.key }));

    expect(fake.state.queued.get(skewed.key)!.resolvedAt ?? null).toBeNull();
  });

  it('naming a key that does not exist is harmless', async () => {
    const out = await send(punchBody('in', ist(21, 6, 4), { correctsKey: '99999999-9999-4999-8999-999999999999' }));
    expect(out.outcome).toBe('APPLIED');
  });

  it('REJECTS a correction that names something that is not a key', async () => {
    expect(await send(punchBody('in', ist(21, 6, 4), { correctsKey: 'not-a-key' }))).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
  });

  it('works from the portal too, scoped to the same user', async () => {
    const held = punchBody('in', ist(21, 6, 47), { badgeCode: 'BPP-8841' });
    await submitPunch({ ...held, queuedBy: USER } as Parameters<typeof submitPunch>[0]);
    expect(fake.state.queued.get(held.key)!.status).toBe('PARKED');

    await submitPunch({ ...punchBody('in', ist(21, 6, 47), { badgeCode: 'BPP-0142', correctsKey: held.key }), queuedBy: USER } as Parameters<typeof submitPunch>[0]);

    expect(fake.state.queued.get(held.key)!.resolvedById).toBe(USER);
  });
});

describe('punches are immutable (D21)', () => {
  it('ingestion only ever INSERTS a punch — it has no update or delete path at all', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/server/mis/attendance-punch.ts'), 'utf8');
    expect(source).not.toMatch(/misAttendancePunch\.(update|updateMany|delete|deleteMany|upsert)/);
  });

  it('the fake refuses to edit a punch exactly as the database trigger does', async () => {
    await expect(fake.db.misAttendancePunch.update()).rejects.toThrow(/mis_attendance_punch_immutable/);
    await expect(fake.db.misAttendancePunch.delete()).rejects.toThrow(/mis_attendance_punch_immutable/);
  });
});
