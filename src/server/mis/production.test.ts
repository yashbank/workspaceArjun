import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newIdempotencyKey } from '@/lib/mis/offline/idempotency';
import { memoryStore, OfflineQueue, type SendResult } from '@/lib/mis/offline/queue';

import { createFakeDb } from './offline-fake-db';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const fake = createFakeDb();
vi.mock('@/server/db', () => ({ db: fake.db }));

const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const { submitProductionLog, logProduction } = await import('./production');

// Real UUIDs — the server validates the shape of every id in an untrusted payload.
const ORDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MACHINE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_USER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

function entry(overrides: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
  return {
    key: newIdempotencyKey(),
    kind: 'production.log' as const,
    payload: { orderId: ORDER, machineId: MACHINE, qtyProduced: 100, qtyWaste: 2, ...payload },
    clientRecordedAt: new Date().toISOString(),
    deviceId: 'tablet-1',
    queuedBy: USER,
    ...overrides,
  } as Parameters<typeof submitProductionLog>[0];
}

/** A clearance granted `grantedAgo` ms ago that lapses after `lastsFor` ms (the D7 cap). */
function clearance(grantedAgo: number, lastsFor: number) {
  const clearedAt = ago(grantedAgo);
  fake.state.clearances.push({
    machineId: MACHINE,
    mode: 'MINUTES',
    orderId: ORDER,
    shiftId: null,
    clearedAt,
    expiresAt: new Date(clearedAt.getTime() + lastsFor),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.queued.clear();
  fake.state.logs = [];
  fake.state.clearances = [];
  fake.state.phases = [];
  fake.state.orders = new Map([[ORDER, { orderNumber: 'ORD-118', status: 'IN_PRODUCTION' }]]);
  fake.state.machines = new Map([[MACHINE, { name: 'Polar 115 Cutter' }]]);
  fake.hooks.failOn = undefined;
  getCurrentUser.mockResolvedValue({ id: USER });
  getMisRole.mockResolvedValue('SUPERVISOR');
  clearance(30 * 60_000, 4 * HOUR); // a valid clearance, the ordinary case
});

describe('THE CENTRAL CLAIM — legal when queued, illegal on arrival, so it PARKS', () => {
  /**
   * The contract in one test. A supervisor logs production at 14:05 under a valid
   * clearance; the tablet has no signal; the clearance lapses; the tablet syncs.
   * The write must neither apply (it cannot be verified from a later replay that
   * the setup was the cleared one) nor vanish (it is real output). It parks, in
   * front of a human, with its payload — Appendix B §B.5.1.
   *
   * If this test ever fails, the offline queue has started either laundering
   * expired clearances into valid ones or losing real production. Both are the
   * outcome the whole contract exists to prevent.
   */
  it('parks — neither applies nor drops — when the clearance expired while it waited', async () => {
    fake.state.clearances = [];
    clearance(3 * HOUR, 2 * HOUR); // granted 3h ago, lasted 2h: it lapsed an hour ago...
    const queuedAt = ago(2.5 * HOUR); // ...but was still valid when the supervisor tapped

    const result = await submitProductionLog(entry({ clientRecordedAt: queuedAt.toISOString() }));

    expect(result.outcome).toBe('PARKED');
    expect(result.reason).toBe('CLEARANCE_EXPIRED');
    expect(result.detail).toMatch(/Polar 115 Cutter/);

    // It did NOT apply.
    expect(fake.state.logs).toHaveLength(0);

    // It did NOT drop: the server holds it, with everything a human needs to resolve it.
    const held = [...fake.state.queued.values()][0];
    expect(held).toMatchObject({
      status: 'PARKED',
      parkReason: 'CLEARANCE_EXPIRED',
      payload: { orderId: ORDER, machineId: MACHINE, qtyProduced: 100 },
    });
    expect(new Date(held.clientRecordedAt as Date).getTime()).toBe(queuedAt.getTime());
  });

  it('end to end through the real queue: parked on the device, kept, and never deleted', async () => {
    fake.state.clearances = [];
    clearance(3 * HOUR, 2 * HOUR);

    const store = memoryStore();
    const queue = new OfflineQueue(store);
    // The sender is the replay action: same server function, no live flag.
    queue.register('production.log', async (item): Promise<SendResult> =>
      submitProductionLog({
        key: item.key,
        kind: 'production.log',
        payload: item.payload as never,
        clientRecordedAt: item.clientRecordedAt,
        queuedBy: USER,
      }),
    );

    await queue.enqueue({
      key: newIdempotencyKey(),
      kind: 'production.log',
      payload: { orderId: ORDER, machineId: MACHINE, qtyProduced: 100 },
      clientRecordedAt: ago(2.5 * HOUR).toISOString(),
    });
    await queue.replay();

    const [item] = await store.all();
    expect(item).toMatchObject({ status: 'PARKED', reason: 'CLEARANCE_EXPIRED' });
    expect(item.detail).toMatch(/clearance/i);
    expect(fake.state.logs).toHaveLength(0);

    // A second pass must not quietly retry it or drop it.
    await queue.replay();
    expect(await store.all()).toHaveLength(1);
    expect(fake.state.logs).toHaveLength(0);
  });

  it('applies normally when the clearance is still valid on arrival', async () => {
    const result = await submitProductionLog(entry({ clientRecordedAt: ago(20 * 60_000).toISOString() }));
    expect(result.outcome).toBe('APPLIED');
    expect(fake.state.logs).toHaveLength(1);
  });
});

describe('the other gates, on replay (Appendix B §B.5)', () => {
  it('D14 — parks a write whose order closed while it waited', async () => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-118', status: 'DELIVERED' });

    const result = await submitProductionLog(entry());

    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'ORDER_CLOSED' });
    expect(result.detail).toMatch(/ORD-118.*delivered/i);
    expect(fake.state.logs).toHaveLength(0);
  });

  it.each(['CANCELLED', 'DELIVERED', 'COMPLETED'])('D14 — refuses production against a %s order', async (status) => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-118', status });
    expect((await submitProductionLog(entry())).reason).toBe('ORDER_CLOSED');
  });

  it('D14 — a reopened order releases the held write on a human retry, and records who', async () => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-118', status: 'DELIVERED' });
    const held = entry();
    expect((await submitProductionLog(held)).outcome).toBe('PARKED');

    fake.state.orders.set(ORDER, { orderNumber: 'ORD-118', status: 'IN_PRODUCTION' }); // reopenOrder
    const released = await submitProductionLog(held, { retry: true });

    expect(released.outcome).toBe('APPLIED');
    expect(fake.state.logs).toHaveLength(1);
    expect(fake.state.queued.get(held.key)).toMatchObject({ status: 'APPLIED', parkReason: null, resolvedById: USER });
  });

  it('D17 — re-clearing the line does NOT release a held expired-clearance write', async () => {
    fake.state.clearances = [];
    clearance(3 * HOUR, 2 * HOUR);
    const held = entry({ clientRecordedAt: ago(2.5 * HOUR).toISOString() });
    expect((await submitProductionLog(held)).reason).toBe('CLEARANCE_EXPIRED');

    clearance(1 * 60_000, 4 * HOUR); // the supervisor clears the line again, just now
    const retried = await submitProductionLog(held, { retry: true });

    // A fresh clearance certifies the machine NOW, not the setup at 14:05. Letting
    // it release the write would launder an expired clearance into a valid one.
    expect(retried).toMatchObject({ outcome: 'PARKED', reason: 'CLEARANCE_EXPIRED' });
    expect(fake.state.logs).toHaveLength(0);
  });

  it('Appendix A — parks when the phase was signed off while it waited', async () => {
    fake.state.phases = [
      { id: 'ph-1', orderId: ORDER, sequence: 1, status: 'SIGNED_OFF', process: { name: 'Printing' }, inCharge: { name: 'Vali Sah' } },
      { id: 'ph-2', orderId: ORDER, sequence: 2, status: 'PENDING', process: { name: 'Lamination' }, inCharge: { name: 'Vali Sah' } },
    ];

    const result = await submitProductionLog(entry());

    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'PHASE_SIGNED_OFF' });
    expect(fake.state.logs).toHaveLength(0);
  });

  it('Appendix A §A.2 — a REOPENED phase is active, so the same write applies', async () => {
    fake.state.phases = [
      { id: 'ph-1', orderId: ORDER, sequence: 1, status: 'REOPENED', process: { name: 'Printing' }, inCharge: { name: 'Vali Sah' } },
    ];
    const result = await submitProductionLog(entry());
    expect(result.outcome).toBe('APPLIED');
    expect(fake.state.logs[0].jobPhaseId).toBe('ph-1');
  });

  it('re-resolves the phase at replay and ignores one supplied by the client', async () => {
    fake.state.phases = [
      { id: 'ph-real', orderId: ORDER, sequence: 1, status: 'IN_PROGRESS', process: { name: 'Printing' }, inCharge: null },
    ];
    await submitProductionLog(entry({}, { jobPhaseId: 'ph-forged' }));
    expect(fake.state.logs[0].jobPhaseId).toBe('ph-real');
  });

  it('an order with no phase plan stays ungated (D10)', async () => {
    const result = await submitProductionLog(entry());
    expect(result.outcome).toBe('APPLIED');
    expect(fake.state.logs[0].jobPhaseId).toBeNull();
  });

  it('D8 — an entry with no machine is REJECTED, and never guessed from the order', async () => {
    const result = await submitProductionLog(entry({}, { machineId: undefined }));

    expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'MACHINE_MISSING' });
    expect(fake.state.logs).toHaveLength(0);
    expect(fake.state.queued.size).toBe(1);
  });

  it('parks a write whose actor lost the right in the meantime', async () => {
    getMisRole.mockResolvedValue('QC'); // no production.write
    const result = await submitProductionLog(entry());
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'FORBIDDEN' });
  });
});

describe('who a write belongs to (§B.5.6, §B.10.2)', () => {
  it('parks rather than re-attributes when a different user is signed in at sync', async () => {
    getCurrentUser.mockResolvedValue({ id: OTHER_USER });

    const result = await submitProductionLog(entry({ queuedBy: USER }));

    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'FORBIDDEN' });
    expect(result.detail).toMatch(/different user/);
    expect(fake.state.logs).toHaveLength(0);
    // The held entry names who MADE it, not whoever happened to be signed in.
    expect([...fake.state.queued.values()][0].actorId).toBe(USER);
  });

  it('a signed-out device waits (RETRY) rather than parking — that is not a withdrawn right', async () => {
    getCurrentUser.mockResolvedValue(null);
    const result = await submitProductionLog(entry());
    expect(result.outcome).toBe('RETRY');
    expect(fake.state.queued.size).toBe(0);
  });

  it('attributes an applied write to the signed-in user, never to a client-supplied id', async () => {
    await submitProductionLog(entry({}, { loggedById: OTHER_USER }));
    expect(fake.state.logs[0].loggedById).toBe(USER);
  });
});

describe('exactly once (MIS-154)', () => {
  it('a double-tap under one key produces one production log', async () => {
    const tap = entry();
    const first = await submitProductionLog(tap);
    const second = await submitProductionLog(tap);

    expect(first.outcome).toBe('APPLIED');
    expect(second).toMatchObject({ outcome: 'DUPLICATE', result: first.result });
    expect(fake.state.logs).toHaveLength(1);
  });

  it('two genuinely distinct entries with identical values are two rows — the key is per action, not per value', async () => {
    await submitProductionLog(entry());
    await submitProductionLog(entry());
    expect(fake.state.logs).toHaveLength(2);
  });

  it('the production row and its key row are one transaction', async () => {
    fake.hooks.failOn = 'queued.update';
    const result = await submitProductionLog(entry());
    expect(result.outcome).not.toBe('APPLIED');
    expect(fake.state.logs).toHaveLength(0);
  });

  it('audits after commit, once, and not at all for a duplicate', async () => {
    const tap = entry();
    await submitProductionLog(tap);
    await submitProductionLog(tap);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({ action: 'LOG_PRODUCTION', actorId: USER });
  });

  it('writes no audit row for a write that was refused', async () => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-118', status: 'DELIVERED' });
    await submitProductionLog(entry());
    expect(audit).not.toHaveBeenCalled();
  });

  it('returns a JSON-safe result — no Decimal, no Date — so a duplicate can replay it', async () => {
    const result = await submitProductionLog(entry());
    expect(JSON.parse(JSON.stringify(result.result))).toEqual(result.result);
    expect(typeof result.result?.qtyProduced).toBe('number');
    expect(typeof result.result?.loggedAt).toBe('string');
  });
});

describe('a live attempt (§B.10.1) — the person is at the screen', () => {
  it('a refusal comes back to them and records nothing', async () => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-118', status: 'DELIVERED' });

    const result = await submitProductionLog(entry(), { live: true });

    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'ORDER_CLOSED' });
    expect(fake.state.queued.size).toBe(0);
  });

  it('forgot to clear the line → clear it → tap Log again under the SAME key → it lands', async () => {
    fake.state.clearances = []; // never cleared
    const tap = entry();

    const first = await submitProductionLog(tap, { live: true });
    expect(first).toMatchObject({ outcome: 'PARKED', reason: 'CLEARANCE_MISSING' });
    expect(first.detail).toMatch(/Polar 115 Cutter/);

    clearance(1 * 60_000, 4 * HOUR); // the "Clear the line" button
    const second = await submitProductionLog(tap, { live: true });

    expect(second.outcome).toBe('APPLIED');
    expect(fake.state.logs).toHaveLength(1);
  });

  it('a device clock running ahead is refused live, not clamped', async () => {
    const result = await submitProductionLog(
      entry({ clientRecordedAt: new Date(Date.now() + 2 * HOUR).toISOString() }),
      { live: true },
    );
    expect(result).toMatchObject({ outcome: 'PARKED', reason: 'CLOCK_SKEW' });
    expect(fake.state.queued.size).toBe(0);
  });
});

describe('what the client may and may not set (D15, mass assignment)', () => {
  it('takes loggedAt from the device — production entries are client-recorded', async () => {
    const at = ago(90 * 60_000);
    await submitProductionLog(entry({ clientRecordedAt: at.toISOString() }));
    expect((fake.state.logs[0].loggedAt as Date).getTime()).toBe(at.getTime());
  });

  it('honours a deliberate back-date, distinct from the tap time', async () => {
    await submitProductionLog(entry({}, { producedOn: '2026-09-15' }));
    expect((fake.state.logs[0].loggedAt as Date).toISOString().slice(0, 10)).toBe('2026-09-15');
  });

  it.each([['not a date', 'sometime'], ['an impossible date', '2026-13-45'], ['the far future', '2099-01-01']])(
    'REJECTS a back-date that is %s',
    async (_label, producedOn) => {
      const result = await submitProductionLog(entry({}, { producedOn }));
      expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
      expect(fake.state.logs).toHaveLength(0);
    },
  );

  it.each([
    ['a missing order', { orderId: undefined }],
    ['a non-UUID order', { orderId: 'not-a-uuid' }],
    ['a negative quantity', { qtyProduced: -5 }],
    ['a non-numeric quantity', { qtyProduced: 'lots' }],
    ['a negative wastage', { qtyWaste: -1 }],
  ])('REJECTS %s', async (_label, patch) => {
    const result = await submitProductionLog(entry({}, patch));
    expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
    expect(fake.state.logs).toHaveLength(0);
  });

  it('rejects an unparseable recorded time', async () => {
    const result = await submitProductionLog(entry({ clientRecordedAt: 'yesterday-ish' }));
    expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
  });

  it('rejects an order that does not exist rather than parking it for a human', async () => {
    fake.state.orders.clear();
    expect(await submitProductionLog(entry())).toMatchObject({ outcome: 'REJECTED', reason: 'MALFORMED' });
  });
});

describe('logProduction, the direct path', () => {
  it('runs the same gates — a closed order refuses here too (D14)', async () => {
    fake.state.orders.set(ORDER, { orderNumber: 'ORD-118', status: 'CANCELLED' });
    await expect(
      logProduction({ orderId: ORDER, machineId: MACHINE, qtyProduced: 10 }),
    ).rejects.toMatchObject({ parkReason: 'ORDER_CLOSED' });
  });

  it('refuses a missing machine even though the type says it is required (D8)', async () => {
    await expect(
      logProduction({ orderId: ORDER, machineId: '', qtyProduced: 10 }),
    ).rejects.toMatchObject({ rejectReason: 'MACHINE_MISSING' });
  });
});
