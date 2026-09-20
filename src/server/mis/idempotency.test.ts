import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeDb } from './offline-fake-db';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const fake = createFakeDb();
vi.mock('@/server/db', () => ({ db: fake.db }));

vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const { runIdempotent, classifyFailure, checkTiming } = await import('./idempotency');
const { LineClearanceBlockedError } = await import('./line-clearance');
const { JobPhaseError } = await import('./job-phases');
const { MisForbiddenError } = await import('./auth');
const { parkable, rejectable, isIdempotencyKey, newIdempotencyKey } = await import(
  '@/lib/mis/offline/idempotency'
);

const KEY = '11111111-2222-4333-8444-555555555555';

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    key: KEY,
    kind: 'production.log' as const,
    payload: { orderId: 'ord-1', machineId: 'm1', qtyProduced: 100 },
    clientRecordedAt: new Date().toISOString(),
    deviceId: 'tablet-1',
    actorId: 'u1',
    ...overrides,
  };
}

/** A business write that records a production row through the transaction handle. */
const writeLog =
  (id = 'log-x') =>
  async (tx: unknown) => {
    const rec = await (tx as typeof fake.db).misProductionLog.create({ data: { id, orderId: 'ord-1' } });
    return { entityType: 'MisProductionLog', entityId: rec.id as string, result: { id: rec.id as string } };
  };

beforeEach(() => {
  fake.state.queued.clear();
  fake.state.logs = [];
  fake.hooks.failOn = undefined;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('SUPERVISOR');
});

describe('the idempotency key (Appendix B §B.2)', () => {
  it('accepts a UUID and nothing else', () => {
    expect(isIdempotencyKey(KEY)).toBe(true);
    expect(isIdempotencyKey('not-a-uuid')).toBe(false);
    expect(isIdempotencyKey('')).toBe(false);
    expect(isIdempotencyKey(42)).toBe(false);
  });

  it('generates a fresh key per call — random per action, never a content hash', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toBe(b);
    expect(isIdempotencyKey(a)).toBe(true);
  });

  it('rejects a write whose key is not a UUID, without touching the database', async () => {
    const apply = vi.fn();
    const result = await runIdempotent(envelope({ key: 'junk' }), apply);
    expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'BAD_KEY' });
    expect(apply).not.toHaveBeenCalled();
    expect(fake.state.queued.size).toBe(0);
  });
});

describe('applying once, however many times it arrives (§B.3)', () => {
  it('applies a first arrival: one business row and one APPLIED key row', async () => {
    const result = await runIdempotent(envelope(), writeLog('log-1'));

    expect(result.outcome).toBe('APPLIED');
    expect(fake.state.logs).toHaveLength(1);
    expect(fake.state.queued.get(KEY)).toMatchObject({ status: 'APPLIED', entityId: 'log-1', parkReason: null });
  });

  it('replaying an applied write returns the ORIGINAL result, not an error', async () => {
    await runIdempotent(envelope(), writeLog('log-1'));
    const apply = vi.fn();

    const again = await runIdempotent(envelope(), apply);

    expect(again.outcome).toBe('DUPLICATE');
    expect(again.result).toEqual({ id: 'log-1' });
    expect(apply).not.toHaveBeenCalled();
  });

  it('ten replays produce one row and nine no-ops', async () => {
    const outcomes: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      outcomes.push((await runIdempotent(envelope(), writeLog(`log-${i}`))).outcome);
    }

    expect(fake.state.logs).toHaveLength(1);
    expect(outcomes[0]).toBe('APPLIED');
    expect(outcomes.slice(1)).toEqual(Array(9).fill('DUPLICATE'));
  });

  it('does not retry behind a human’s back once a write is parked', async () => {
    fake.state.queued.set(KEY, { key: KEY, status: 'PARKED', parkReason: 'CLEARANCE_EXPIRED', parkDetail: 'expired', attempts: 1 });
    const apply = vi.fn();

    const result = await runIdempotent(envelope(), apply);

    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'CLEARANCE_EXPIRED' });
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('the dedupe is atomic — §B.7 and §B.10.5', () => {
  it('rolls the business row back if the key row cannot be finalised', async () => {
    fake.hooks.failOn = 'queued.update';

    const result = await runIdempotent(envelope(), writeLog('log-1'));

    expect(result.outcome).not.toBe('APPLIED');
    // The row must not survive without its key — that is the whole rule.
    expect(fake.state.logs).toHaveLength(0);
    expect(fake.state.queued.get(KEY)?.status).not.toBe('APPLIED');
  });

  it('a lost race commits ONE business row and returns the winner’s result', async () => {
    // Both attempts read the key as absent — the situation a true race creates.
    // (A: no row yet. B: read before A committed.) A then commits; B must lose at
    // the claim and take its business write with it.
    const original = fake.db.misQueuedWrite.findUnique;
    let reads = 0;
    fake.db.misQueuedWrite.findUnique = async (args) => {
      reads += 1;
      return reads <= 2 ? null : original(args);
    };

    try {
      const a = await runIdempotent(envelope(), writeLog('log-a'));
      const b = await runIdempotent(envelope(), writeLog('log-b'));

      expect(a.outcome).toBe('APPLIED');
      expect(b).toMatchObject({ outcome: 'DUPLICATE', result: { id: 'log-a' } });
      // The bug an upsert would have shipped: two rows under one key.
      expect(fake.state.logs).toHaveLength(1);
      expect(fake.state.logs[0].id).toBe('log-a');
    } finally {
      fake.db.misQueuedWrite.findUnique = original;
    }
  });

  it('a conditional claim on an existing row also loses cleanly', async () => {
    fake.state.queued.set(KEY, { key: KEY, status: 'IN_FLIGHT', attempts: 1, payload: {} });
    const original = fake.db.misQueuedWrite.findUnique;
    let reads = 0;
    // First read sees IN_FLIGHT (the stale view); by the claim, another attempt has finished.
    fake.db.misQueuedWrite.findUnique = async (args) => {
      reads += 1;
      if (reads === 1) return { key: KEY, status: 'IN_FLIGHT', attempts: 1 };
      return original(args);
    };
    fake.state.queued.set(KEY, { key: KEY, status: 'APPLIED', result: { id: 'log-winner' }, attempts: 2 });

    try {
      const result = await runIdempotent(envelope(), writeLog('log-loser'));
      expect(result).toMatchObject({ outcome: 'DUPLICATE', result: { id: 'log-winner' } });
      expect(fake.state.logs).toHaveLength(0);
    } finally {
      fake.db.misQueuedWrite.findUnique = original;
    }
  });
});

describe('a live attempt never parks (§B.10.1)', () => {
  it('returns the refusal to the caller and records NOTHING', async () => {
    const result = await runIdempotent(
      envelope(),
      async () => {
        throw new LineClearanceBlockedError('m1', 'Polar 115', 'EXPIRED', new Date());
      },
      { live: true },
    );

    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'CLEARANCE_EXPIRED' });
    expect(fake.state.queued.size).toBe(0);
  });

  it('so the fix-and-resend recovery works: same key, applied on the second try', async () => {
    let cleared = false;
    const apply = async (tx: unknown) => {
      if (!cleared) throw new LineClearanceBlockedError('m1', 'Polar 115', 'NOT_CLEARED');
      return writeLog('log-1')(tx);
    };

    const first = await runIdempotent(envelope(), apply, { live: true });
    cleared = true; // the supervisor taps "Clear the line"
    const second = await runIdempotent(envelope(), apply, { live: true });

    expect(first.outcome).toBe('PARKED');
    expect(second.outcome).toBe('APPLIED');
    expect(fake.state.logs).toHaveLength(1);
  });

  it('but a replayed write that fails IS parked, durably, with its payload', async () => {
    await runIdempotent(envelope(), async () => {
      throw parkable('ORDER_CLOSED', 'closed');
    });

    expect(fake.state.queued.get(KEY)).toMatchObject({
      status: 'PARKED',
      parkReason: 'ORDER_CLOSED',
      payload: { orderId: 'ord-1', machineId: 'm1', qtyProduced: 100 },
    });
  });

  it('a lost-response live write replays as DUPLICATE under the same key', async () => {
    await runIdempotent(envelope(), writeLog('log-1'), { live: true }); // applied; the response was lost
    const replay = await runIdempotent(envelope(), writeLog('log-2')); // the queue sends it again
    expect(replay).toMatchObject({ outcome: 'DUPLICATE', result: { id: 'log-1' } });
    expect(fake.state.logs).toHaveLength(1);
  });
});

describe('a human retry releases only what D17 allows (§B.10.4)', () => {
  const parkAs = (reason: string) =>
    fake.state.queued.set(KEY, {
      key: KEY,
      kind: 'production.log',
      status: 'PARKED',
      parkReason: reason,
      parkDetail: 'held',
      attempts: 1,
      payload: {},
    });

  it('re-runs the gates for a world-changed park, and records who released it', async () => {
    parkAs('ORDER_CLOSED');

    const result = await runIdempotent(envelope(), writeLog('log-1'), { retry: true });

    expect(result.outcome).toBe('APPLIED');
    expect(fake.state.queued.get(KEY)).toMatchObject({
      status: 'APPLIED',
      parkReason: null,
      resolvedById: 'u1',
    });
  });

  it('without the retry flag the same park stays parked', async () => {
    parkAs('ORDER_CLOSED');
    const apply = vi.fn();
    const result = await runIdempotent(envelope(), apply);
    expect(result.outcome).toBe('PARKED');
    expect(apply).not.toHaveBeenCalled();
  });

  it.each(['CLEARANCE_EXPIRED', 'CLEARANCE_MISSING', 'CLOCK_SKEW', 'TOO_OLD'])(
    'a retry may NOT release %s — that needs an audited override',
    async (reason) => {
      parkAs(reason);
      const apply = vi.fn();

      const result = await runIdempotent(envelope(), apply, { retry: true });

      expect(result).toMatchObject({ outcome: 'PARKED', reason });
      expect(apply).not.toHaveBeenCalled();
    },
  );

  it('never replays a REJECTED entry, retry or not — the fix is a new key', async () => {
    fake.state.queued.set(KEY, { key: KEY, status: 'REJECTED', parkReason: 'MACHINE_MISSING', parkDetail: 'x', attempts: 1 });
    const apply = vi.fn();
    const result = await runIdempotent(envelope(), apply, { retry: true });
    expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'MACHINE_MISSING' });
    expect(apply).not.toHaveBeenCalled();
  });

  it('a retry that still fails re-parks with the CURRENT reason', async () => {
    parkAs('ORDER_CLOSED');
    const result = await runIdempotent(
      envelope(),
      async () => {
        throw new JobPhaseError('NO_ACTIVE_PHASE', 'No phase is running.');
      },
      { retry: true },
    );
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'PHASE_SIGNED_OFF' });
    expect(fake.state.queued.get(KEY)).toMatchObject({ status: 'PARKED', parkReason: 'PHASE_SIGNED_OFF' });
  });
});

describe('surviving the gates from Phases 6-9 (§B.5)', () => {
  const applyThrowing = (error: unknown) => async () => {
    throw error;
  };

  it('parks a write whose line clearance expired (D7)', async () => {
    const result = await runIdempotent(
      envelope(),
      applyThrowing(new LineClearanceBlockedError('m1', 'Polar 115', 'EXPIRED', new Date())),
    );
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'CLEARANCE_EXPIRED' });
    expect(result.detail).toMatch(/Polar 115/);
  });

  it('parks a write whose phase was signed off while it waited (Appendix A)', async () => {
    const result = await runIdempotent(
      envelope(),
      applyThrowing(new JobPhaseError('NO_ACTIVE_PHASE', 'No phase is running on this order.')),
    );
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'PHASE_SIGNED_OFF' });
  });

  it('parks rather than guesses when two phases are active', async () => {
    const result = await runIdempotent(
      envelope(),
      applyThrowing(new JobPhaseError('AMBIGUOUS_ACTIVE_PHASE', 'More than one phase is running.')),
    );
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'PHASE_AMBIGUOUS' });
  });

  it('retires — does not park — a transition that already happened', async () => {
    const result = await runIdempotent(
      envelope(),
      applyThrowing(new JobPhaseError('ALREADY_IN_STATE', 'This phase is already signed off.')),
    );
    expect(result.outcome).toBe('DUPLICATE');
  });

  it('parks a write whose actor lost permission in the meantime, never re-attributing it', async () => {
    const result = await runIdempotent(envelope(), applyThrowing(new MisForbiddenError('production.write')));
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'FORBIDDEN' });
  });

  it('parks a closed order (D14) via the label the domain module attaches', async () => {
    const result = await runIdempotent(
      envelope(),
      applyThrowing(parkable('ORDER_CLOSED', 'ORD-118 was delivered on 12 Sep.')),
    );
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'ORDER_CLOSED' });
  });

  it('rejects an entry with no machine (D8) — no passage of time fixes it', async () => {
    const result = await runIdempotent(
      envelope(),
      applyThrowing(rejectable('MACHINE_MISSING', 'This entry has no machine.')),
    );
    expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'MACHINE_MISSING' });
    expect(fake.state.queued.get(KEY)?.status).toBe('REJECTED');
  });

  it('keeps the payload when it parks, so the portal can resolve it without the device', async () => {
    await runIdempotent(envelope(), applyThrowing(parkable('ORDER_CLOSED', 'closed')));
    expect(fake.state.queued.get(KEY)?.payload).toEqual({ orderId: 'ord-1', machineId: 'm1', qtyProduced: 100 });
  });

  it('a failed write leaves no business row behind', async () => {
    await runIdempotent(envelope(), async (tx) => {
      await writeLog('log-1')(tx);
      throw parkable('ORDER_CLOSED', 'closed');
    });
    expect(fake.state.logs).toHaveLength(0);
  });
});

describe('transient failures retry, unknown ones eventually park (§B.3, §B.6)', () => {
  it('retries a deadlock', () => {
    const deadlock = Object.assign(new Error('write conflict'), { code: 'P2034' });
    expect(classifyFailure(deadlock, 0).outcome).toBe('RETRY');
  });

  it('retries an unreachable database', () => {
    const down = Object.assign(new Error('cannot reach'), { code: 'P1001' });
    expect(classifyFailure(down, 3).outcome).toBe('RETRY');
  });

  it('retries an unknown error at first', () => {
    expect(classifyFailure(new Error('who knows'), 0).outcome).toBe('RETRY');
  });

  it('parks an unknown error that keeps happening, rather than looping forever', () => {
    expect(classifyFailure(new Error('who knows'), 4)).toMatchObject({ outcome: 'PARKED', reason: 'UNKNOWN' });
  });
});

describe('whose clock decides (D15, §B.4)', () => {
  it('accepts a punch recorded well in the past — a 06:04 punch is a 06:04 punch', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await expect(checkTiming('attendance.punch_in', twoHoursAgo)).resolves.toBeNull();
  });

  it('parks a punch from a device whose clock runs ahead — never clamps it to now()', async () => {
    const future = new Date(Date.now() + 90 * 60 * 1000);
    const result = await checkTiming('attendance.punch_in', future);
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'CLOCK_SKEW' });
    expect(result?.detail).toMatch(/ahead of the server/);
  });

  it('parks a write older than the queue age limit, rather than discarding it', async () => {
    const ancient = new Date(Date.now() - 100 * 60 * 60 * 1000);
    expect(await checkTiming('production.log', ancient)).toMatchObject({ outcome: 'PARKED', reason: 'TOO_OLD' });
  });

  it('ignores skew for a server-stamped kind, where the device clock is only evidence', async () => {
    const future = new Date(Date.now() + 90 * 60 * 1000);
    await expect(checkTiming('production.waste_reason', future)).resolves.toBeNull();
  });

  it('parks on skew before running the write at all', async () => {
    const apply = vi.fn();
    const result = await runIdempotent(
      envelope({ clientRecordedAt: new Date(Date.now() + 90 * 60 * 1000).toISOString() }),
      apply,
    );
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'CLOCK_SKEW' });
    expect(apply).not.toHaveBeenCalled();
  });
});
