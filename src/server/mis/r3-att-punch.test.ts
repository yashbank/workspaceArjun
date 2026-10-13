import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { newIdempotencyKey } from '@/lib/mis/offline/idempotency';

import { createFakeDb } from './offline-fake-db';

/**
 * R3-ATT (B57, B58, B60): punch identity, the additive `note`, and the work date the tablet is told.
 * Same in-memory fake as attendance-punch.test.ts; "now" is 07:41 IST on 21 Sep 2026.
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

const { ingestDevicePunch } = await import('./attendance-punch');

const IST_OFFSET_MS = 330 * 60_000;
const ist = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 8, day, h, m) - IST_OFFSET_MS);
const NOW = ist(21, 7, 41);

const DEVICE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const S1 = '51111111-1111-4111-8111-111111111111';
const NIGHT = '53333333-3333-4333-8333-333333333333';
const GONE = '54444444-4444-4444-8444-444444444444';

function body(kind: 'in' | 'out', when: Date, payload: Record<string, unknown> = {}) {
  return {
    key: newIdempotencyKey(),
    kind: kind === 'in' ? 'attendance.punch_in' : 'attendance.punch_out',
    payload: { badgeCode: 'BPP-0142', ...payload },
    clientRecordedAt: when.toISOString(),
  };
}
const send = (b: unknown) => ingestDevicePunch('Bearer mkd_x', b);

/** The fake looks an employee up by employeeCode only, so an operator row carries none (see attendance-punch.test.ts). */
const operator = (over: Record<string, unknown>) => fake.state.employees.push({ id: OP, isActive: true, deletedAt: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  fake.state.queued.clear();
  fake.state.punches = [];
  fake.state.attendance = [];
  fake.state.employees = [{ id: 'e1', employeeCode: 'BPP-0142', name: 'Ramesh Kumar', isActive: true, deletedAt: null }];
  fake.state.shifts = [
    { id: S1, name: 'Shift 1', startTime: '06:00', endTime: '14:00', isActive: true },
    { id: NIGHT, name: 'Night', startTime: '22:00', endTime: '06:00', isActive: true },
    { id: GONE, name: 'Retired', startTime: '08:00', endTime: '16:00', isActive: false },
  ];
  fake.state.rules['factory.timezone'] = 'Asia/Kolkata';
  fake.state.rules['ATTENDANCE_CORRECTION_DAYS'] = '3';
  fake.hooks.failOn = undefined;
  authenticateDevice.mockResolvedValue({ id: DEVICE, name: 'GATE-01', revoked: false });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ATTENDANCE_OPERATOR');
});
afterEach(() => vi.useRealTimers());

describe('B57 punch identity', () => {
  it('an operator that is not an employee at all is REJECTED BAD_OPERATOR (not retryable) and nothing is written', async () => {
    const out = await send(body('in', ist(21, 6, 4), { operatorId: OP }));
    expect(out).toMatchObject({ outcome: 'REJECTED', reason: 'BAD_OPERATOR' });
    expect(fake.state.punches).toHaveLength(0);
  });

  it.each([
    ['a WORKER', { role: 'WORKER' }],
    ['a STORE_GUY', { role: 'STORE_GUY' }],
    ['an inactive operator', { role: 'ATTENDANCE_OPERATOR', isActive: false }],
    ['a deleted operator', { role: 'ATTENDANCE_OPERATOR', deletedAt: new Date() }],
  ])('%s is REJECTED BAD_OPERATOR', async (_label, over) => {
    operator(over);
    const out = await send(body('in', ist(21, 6, 4), { operatorId: OP }));
    expect(out).toMatchObject({ outcome: 'REJECTED', reason: 'BAD_OPERATOR' });
  });

  it.each(['ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'ADMIN', 'OWNER'])('a %s operator is applied as today', async (role) => {
    operator({ role });
    const out = await send(body('in', ist(21, 6, 4), { operatorId: OP }));
    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.punches[0].operatorId).toBe(OP);
  });

  it('a shift hint that is an inactive (or unknown) shift is REJECTED BAD_SHIFT', async () => {
    expect(await send(body('in', ist(21, 6, 4), { shiftId: GONE }))).toMatchObject({ outcome: 'REJECTED', reason: 'BAD_SHIFT' });
    expect(await send(body('in', ist(21, 6, 5), { shiftId: '99999999-9999-4999-8999-999999999999' }))).toMatchObject({
      outcome: 'REJECTED',
      reason: 'BAD_SHIFT',
    });
    expect(fake.state.punches).toHaveLength(0);
  });

  it('a valid active shift hint is recorded', async () => {
    const out = await send(body('in', ist(21, 6, 4), { shiftId: S1 }));
    expect(out.outcome).toBe('APPLIED');
    expect(fake.state.punches[0].shiftId).toBe(S1);
  });
});

describe('B58 the optional note', () => {
  it('a repeated IN inside an open stretch is absorbed and says ALREADY_IN', async () => {
    const first = await send(body('in', ist(21, 6, 4)));
    expect(first.result).not.toHaveProperty('note');
    const second = await send(body('in', ist(21, 6, 30)));
    expect(second.outcome).toBe('APPLIED');
    expect(second.result?.note).toBe('ALREADY_IN');
  });

  it('an OUT with no IN to pair with says NO_OPEN_IN', async () => {
    const out = await send(body('out', ist(21, 5, 0)));
    expect(out.outcome).toBe('APPLIED');
    expect(out.result?.note).toBe('NO_OPEN_IN');
  });

  it('a normal IN then OUT carries no note', async () => {
    await send(body('in', ist(21, 6, 4)));
    const out = await send(body('out', ist(21, 7, 0)));
    expect(out.result).not.toHaveProperty('note');
  });
});

describe('B60 workDate in the punch answer', () => {
  it('a 22:10 IN on the 22:00-06:00 shift answers that day, and the 05:00 OUT next morning answers the same day', async () => {
    const inn = await send(body('in', ist(20, 22, 10), { shiftId: NIGHT }));
    expect(inn.result?.workDate).toBe('2026-09-20');
    const out = await send(body('out', ist(21, 5, 0), { shiftId: NIGHT }));
    expect(out.result?.workDate).toBe('2026-09-20');
  });

  it('a duplicate send answers the same workDate', async () => {
    const b = body('in', ist(21, 6, 4));
    const first = await send(b);
    const again = await send(b);
    expect(again.outcome).toBe('DUPLICATE');
    expect(again.result?.workDate).toBe(first.result?.workDate);
  });
});
