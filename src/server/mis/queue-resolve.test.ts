/**
 * Phase 23 · `resolveParkedWrite` — the inbox's "apply past a park" (Appendix B §B.7,
 * §B.10.4). Reuses `offline-fake-db.ts`, the same fixture idempotency.test.ts/
 * production.test.ts/attendance-punch.test.ts already trust, since this function's whole
 * job is to call the SAME server functions those files exercise directly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeDb } from './offline-fake-db';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const fake = createFakeDb();
vi.mock('@/server/db', () => ({ db: fake.db }));

vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const { resolveParkedWrite } = await import('./queue-resolve');
const { MisForbiddenError } = await import('./auth');

let seq = 0;
const ORDER_ID = '00000000-0000-4000-8000-000000000001';
const MACHINE_ID = '00000000-0000-4000-8000-000000000002';

/** A PARKED row, ready for `resolveParkedWrite` to act on. Keys AND any uuid-shaped payload
 * fields must be real UUIDs — `toLogInput`/`runIdempotent` reject anything else as
 * MALFORMED/BAD_KEY before the resolve logic this file tests is ever reached. */
function seedQueued(overrides: Record<string, unknown> = {}) {
  const n = String(++seq).padStart(12, '0');
  const key = `11111111-2222-4333-8444-${n}`;
  fake.state.queued.set(key, {
    key,
    kind: 'production.log',
    status: 'PARKED',
    payload: { orderId: ORDER_ID, machineId: MACHINE_ID, qtyProduced: 10 },
    parkReason: 'ORDER_CLOSED',
    parkDetail: 'order was closed',
    // "Now", not a fixed past date — `checkTiming` runs on every resolve attempt unless the
    // override skips it, and a stale fixed date would drift into TOO_OLD as real time passes.
    clientRecordedAt: new Date(),
    deviceId: null,
    actorId: 'original-worker',
    attempts: 1,
    firstSeenAt: new Date(),
    lastAttemptAt: new Date(),
    resolvedAt: null,
    resolvedById: null,
    resolutionNote: null,
    ...overrides,
  });
  return key;
}

beforeEach(() => {
  seq = 0;
  fake.state.queued.clear();
  fake.state.logs = [];
  fake.state.punches = [];
  fake.state.attendance = [];
  fake.state.employees = [];
  fake.state.shifts = [];
  fake.state.orders = new Map();
  fake.state.machines = new Map();
  fake.state.clearances = [];
  fake.state.phases = [];
  fake.hooks.failOn = undefined;
  getCurrentUser.mockResolvedValue({ id: 'resolver-1' });
  getMisRole.mockResolvedValue('OWNER');
  fake.state.machines.set(MACHINE_ID, { name: 'Press 1' });
  fake.state.orders.set(ORDER_ID, { orderNumber: 'SO-1', status: 'DELIVERED' });
});

describe('the base door and visibility (shared with list/discard)', () => {
  it('refuses a role holding neither queue.review nor an override', async () => {
    const key = seedQueued();
    getMisRole.mockResolvedValue('QC');
    await expect(resolveParkedWrite(key, 'reopened it')).rejects.toThrow(MisForbiddenError);
  });

  it("refuses a role that holds queue.review but not this row's own kind permission", async () => {
    const key = seedQueued({ kind: 'production.log' });
    getMisRole.mockResolvedValue('SUPER_ATTENDANCE_OPERATOR'); // queue.review, no production.read
    await expect(resolveParkedWrite(key, 'reopened it')).rejects.toThrow(MisForbiddenError);
  });

  it('requires a real reason', async () => {
    const key = seedQueued();
    await expect(resolveParkedWrite(key, '')).rejects.toThrow(/reason/i);
  });

  it('refuses a key that does not exist', async () => {
    await expect(resolveParkedWrite('no-such-key', 'whatever')).rejects.toThrow(/no parked write/i);
  });

  it('refuses a REJECTED row — discard is the only door for those', async () => {
    const key = seedQueued({ status: 'REJECTED', parkReason: 'MALFORMED' });
    await expect(resolveParkedWrite(key, 'trying anyway')).rejects.toThrow(/only a PARKED write/i);
  });

  it('BADGE_UNKNOWN is never resolved from here — the tablet\'s own Fix owns it', async () => {
    const key = seedQueued({ kind: 'attendance.punch_in', parkReason: 'BADGE_UNKNOWN' });
    await expect(resolveParkedWrite(key, 'guessing who it was')).rejects.toThrow(/cannot be resolved from the inbox/i);
  });
});

describe('the retryable reasons (ORDER_CLOSED etc.) — the world must genuinely change first', () => {
  it('re-parks the SAME reason if the order is still closed — an override never forces a gate', async () => {
    const key = seedQueued({ parkReason: 'ORDER_CLOSED' });
    const result = await resolveParkedWrite(key, 'admin says reopen it');
    expect(result.outcome).toBe('PARKED');
    expect(result.reason).toBe('ORDER_CLOSED');
    expect(fake.state.queued.get(key)!.resolvedAt).toBeNull(); // not resolved — it did not actually land
  });

  it('applies once the order is genuinely reopened, and records the RESOLVER, not the original actor', async () => {
    const key = seedQueued({ parkReason: 'ORDER_CLOSED' });
    fake.state.orders.get(ORDER_ID)!.status = 'IN_PROGRESS';
    // Still needs a real clearance — a retryable-reason resolve bypasses only the identity
    // check, never any other gate (an override forces nothing it wasn't specifically built for).
    fake.state.clearances.push({ machineId: MACHINE_ID, clearedAt: new Date(), mode: 'MINUTES', expiresAt: null });

    const result = await resolveParkedWrite(key, 'reopened SO-1, applying the held entry');
    expect(result.outcome).toBe('APPLIED');
    expect(fake.state.logs).toHaveLength(1);

    const row = fake.state.queued.get(key)!;
    expect(row.status).toBe('APPLIED');
    expect(row.resolvedById).toBe('resolver-1'); // the office resolver, not 'original-worker'
    expect(row.resolutionNote).toBe('reopened SO-1, applying the held entry');
  });
});

describe('the clearance override — needs clearance.write on top of queue.review', () => {
  it('refuses a resolver who holds queue.review but not clearance.write', async () => {
    const key = seedQueued({ parkReason: 'CLEARANCE_MISSING' });
    getMisRole.mockResolvedValue('QC'); // holds nothing here — this only proves the extra gate exists
    await expect(resolveParkedWrite(key, 'confirming the earlier clearance')).rejects.toThrow();
  });

  it('applies for a clearance.write holder even with no clearance on file now — it never re-checks clearance (§B.5.1)', async () => {
    const key = seedQueued({ parkReason: 'CLEARANCE_MISSING' });
    fake.state.orders.get(ORDER_ID)!.status = 'IN_PROGRESS'; // isolate: only clearance is under test here
    // Deliberately no rows in fake.state.clearances: a plain retry would still fail this
    // gate. The override records a human's confirmation instead of satisfying the gate.
    const result = await resolveParkedWrite(key, 'confirmed against the 10:00 clearance log');
    expect(result.outcome).toBe('APPLIED');
    expect(fake.state.queued.get(key)!.resolvedById).toBe('resolver-1');
  });
});

describe('the punch overrides — need attendance.write on top of queue.review', () => {
  beforeEach(() => {
    fake.state.employees = [{ id: 'e1', name: 'Worker One', employeeCode: 'W1', isActive: false, deletedAt: null }];
  });

  it('refuses a resolver without attendance.write', async () => {
    const key = seedQueued({
      kind: 'attendance.punch_in',
      parkReason: 'EMPLOYEE_INACTIVE',
      payload: { badgeCode: 'W1' },
    });
    getMisRole.mockResolvedValue('QC');
    await expect(resolveParkedWrite(key, 'reinstating for this one punch')).rejects.toThrow();
  });

  it('applies an EMPLOYEE_INACTIVE punch for an attendance.write holder, without reactivating the employee', async () => {
    const key = seedQueued({
      kind: 'attendance.punch_in',
      parkReason: 'EMPLOYEE_INACTIVE',
      payload: { badgeCode: 'W1' },
    });
    const result = await resolveParkedWrite(key, 'was still on shift that day, recording it');
    expect(result.outcome).toBe('APPLIED');
    expect(fake.state.punches).toHaveLength(1);
    expect(fake.state.employees[0].isActive).toBe(false); // the override did not touch the roster
    expect(fake.state.queued.get(key)!.resolvedById).toBe('resolver-1');
  });

  it('applies a CLOCK_SKEW punch by skipping checkTiming entirely — a plain retry could never clear it', async () => {
    fake.state.employees[0].isActive = true;
    const key = seedQueued({
      kind: 'attendance.punch_in',
      parkReason: 'CLOCK_SKEW',
      payload: { badgeCode: 'W1' },
      clientRecordedAt: new Date(Date.now() + 90 * 60 * 1000), // still skewed right now
    });
    const result = await resolveParkedWrite(key, 'device clock confirmed wrong, vouching for this time');
    expect(result.outcome).toBe('APPLIED');
    expect(fake.state.punches).toHaveLength(1);
  });
});
