import { describe, expect, it, vi } from 'vitest';

import { newIdempotencyKey } from './idempotency';
import {
  backoffMs,
  canRetry,
  memoryStore,
  OfflineQueue,
  replayOrder,
  type QueuedItem,
  type SendResult,
} from './queue';

/**
 * The replay engine, tested with no IndexedDB, no network and no database —
 * which is the point of the store seam in Appendix B §B.9.
 */

function item(overrides: Partial<QueuedItem> = {}): QueuedItem {
  return {
    key: newIdempotencyKey(),
    kind: 'production.log',
    payload: { qtyProduced: 100 },
    clientRecordedAt: '2026-09-19T06:00:00.000Z',
    status: 'PENDING',
    attempts: 0,
    ...overrides,
  };
}

const applied = async (): Promise<SendResult> => ({ outcome: 'APPLIED' });

describe('ordering — per-device FIFO by clientRecordedAt (§B.6)', () => {
  it('sorts by the moment of the tap, not insertion order', () => {
    const late = item({ key: 'a-late', clientRecordedAt: '2026-09-19T07:00:00.000Z' });
    const early = item({ key: 'b-early', clientRecordedAt: '2026-09-19T06:00:00.000Z' });
    expect(replayOrder([late, early]).map((i) => i.key)).toEqual(['b-early', 'a-late']);
  });

  it('breaks ties on the key so the order is total and stable', () => {
    const a = item({ key: 'aaa', clientRecordedAt: '2026-09-19T06:00:00.000Z' });
    const b = item({ key: 'bbb', clientRecordedAt: '2026-09-19T06:00:00.000Z' });
    expect(replayOrder([b, a]).map((i) => i.key)).toEqual(['aaa', 'bbb']);
  });

  it('sends three airplane-mode writes once each, in order (MIS-86 done-when)', async () => {
    const sent: string[] = [];
    const store = memoryStore([
      item({ key: 'k3', clientRecordedAt: '2026-09-19T06:20:00.000Z' }),
      item({ key: 'k1', clientRecordedAt: '2026-09-19T06:00:00.000Z' }),
      item({ key: 'k2', clientRecordedAt: '2026-09-19T06:10:00.000Z' }),
    ]);
    const queue = new OfflineQueue(store);
    queue.register('production.log', async (i) => {
      sent.push(i.key);
      return applied();
    });

    await queue.replay();

    expect(sent).toEqual(['k1', 'k2', 'k3']);
    expect(await store.all()).toEqual([]);
  });
});

describe('outcomes (§B.3)', () => {
  it('retires an applied write from the queue', async () => {
    const store = memoryStore([item({ key: 'k1' })]);
    const queue = new OfflineQueue(store);
    queue.register('production.log', applied);

    await queue.replay();

    expect(await store.get('k1')).toBeUndefined();
  });

  it('retires a duplicate too — it already succeeded, it is not a failure', async () => {
    const store = memoryStore([item({ key: 'k1' })]);
    const queue = new OfflineQueue(store);
    queue.register('production.log', async () => ({ outcome: 'DUPLICATE' }));

    await queue.replay();

    expect(await store.get('k1')).toBeUndefined();
  });

  it('keeps a parked write visible with its reason, and stops retrying it', async () => {
    const store = memoryStore([item({ key: 'k1' })]);
    const queue = new OfflineQueue(store);
    const sender = vi.fn(async (): Promise<SendResult> => ({
      outcome: 'PARKED',
      reason: 'CLEARANCE_EXPIRED',
      detail: "Polar 115's line clearance expired.",
    }));
    queue.register('production.log', sender);

    await queue.replay();
    await queue.replay();

    const parked = await store.get('k1');
    expect(parked).toMatchObject({ status: 'PARKED', reason: 'CLEARANCE_EXPIRED' });
    expect(parked?.detail).toMatch(/Polar 115/);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('never deletes a parked write on its own', async () => {
    const store = memoryStore([item({ key: 'k1' })]);
    const queue = new OfflineQueue(store);
    queue.register('production.log', async () => ({ outcome: 'REJECTED', reason: 'MACHINE_MISSING' }));

    await queue.replay();

    expect(await store.get('k1')).toBeDefined();
  });

  it('backs off after a retryable failure instead of hammering', async () => {
    const store = memoryStore([item({ key: 'k1' })]);
    const queue = new OfflineQueue(store);
    queue.register('production.log', async () => ({ outcome: 'RETRY', detail: 'offline' }));

    await queue.replay(1_000);

    const after = await store.get('k1');
    expect(after?.status).toBe('PENDING');
    expect(after?.attempts).toBe(1);
    expect(after?.nextAttemptAt).toBeGreaterThan(1_000);
  });

  it('does not send an item before its backoff has elapsed', async () => {
    const store = memoryStore([item({ key: 'k1', nextAttemptAt: 10_000 })]);
    const queue = new OfflineQueue(store);
    const sender = vi.fn(applied);
    queue.register('production.log', sender);

    await queue.replay(5_000);

    expect(sender).not.toHaveBeenCalled();
  });

  it('treats a thrown sender as retryable rather than losing the write', async () => {
    const store = memoryStore([item({ key: 'k1' })]);
    const queue = new OfflineQueue(store);
    queue.register('production.log', async () => {
      throw new Error('network died');
    });

    await queue.replay(1_000);

    expect(await store.get('k1')).toMatchObject({ status: 'PENDING', detail: 'network died' });
  });
});

describe('a park does not block the entries behind it (§B.6)', () => {
  it('continues past a parked item of a different kind', async () => {
    const sent: string[] = [];
    const store = memoryStore([
      item({ key: 'k1', clientRecordedAt: '2026-09-19T06:00:00.000Z' }),
      item({
        key: 'k2',
        kind: 'production.waste_reason',
        clientRecordedAt: '2026-09-19T06:10:00.000Z',
      }),
    ]);
    const queue = new OfflineQueue(store);
    queue.register('production.log', async () => ({ outcome: 'PARKED', reason: 'ORDER_CLOSED' }));
    queue.register('production.waste_reason', async (i) => {
      sent.push(i.key);
      return applied();
    });

    await queue.replay();

    expect(sent).toEqual(['k2']);
    expect(await store.get('k1')).toMatchObject({ status: 'PARKED' });
  });

  it('parks a clock-out whose clock-in parked, rather than applying it against nothing', async () => {
    const store = memoryStore([
      item({ key: 'in', kind: 'attendance.punch_in', clientRecordedAt: '2026-09-19T06:00:00.000Z' }),
      item({ key: 'out', kind: 'attendance.punch_out', clientRecordedAt: '2026-09-19T14:00:00.000Z' }),
    ]);
    const queue = new OfflineQueue(store);
    queue.register('attendance.punch_in', async () => ({ outcome: 'PARKED', reason: 'CLOCK_SKEW' }));
    const outSender = vi.fn(applied);
    queue.register('attendance.punch_out', outSender);

    await queue.replay();

    expect(outSender).not.toHaveBeenCalled();
    expect(await store.get('out')).toMatchObject({ status: 'PARKED', reason: 'PREDECESSOR_PARKED' });
  });
});

describe('a parked punch holds back only ITS PERSON’s clock-out (K2 — one unrecognised badge must not stop a morning)', () => {
  const punch = (key: string, kind: 'attendance.punch_in' | 'attendance.punch_out', badgeCode: string, at: string) =>
    item({ key, kind, payload: { badgeCode }, clientRecordedAt: at });

  it('THE BUG THIS PINS: an unrecognised badge’s clock-in does NOT park somebody else’s clock-out', async () => {
    const store = memoryStore([
      punch('unknown-in', 'attendance.punch_in', 'BPP-8841', '2026-09-21T00:47:00.000Z'),
      punch('ramesh-out', 'attendance.punch_out', 'BPP-0142', '2026-09-21T08:30:00.000Z'),
    ]);
    const queue = new OfflineQueue(store);
    queue.register('attendance.punch_in', async () => ({ outcome: 'PARKED', reason: 'BADGE_UNKNOWN' }));
    const outSender = vi.fn(applied);
    queue.register('attendance.punch_out', outSender);

    await queue.replay();

    expect(outSender).toHaveBeenCalledTimes(1); // Ramesh goes home; the unknown badge is nothing to do with him
    expect(await store.get('ramesh-out')).toBeUndefined(); // sent and retired
    expect(await store.get('unknown-in')).toMatchObject({ status: 'PARKED', reason: 'BADGE_UNKNOWN' });
  });

  it('still parks the SAME person’s clock-out, rather than applying it against a clock-in that never landed (§B.6)', async () => {
    const store = memoryStore([
      punch('in', 'attendance.punch_in', 'BPP-0142', '2026-09-21T00:30:00.000Z'),
      punch('out', 'attendance.punch_out', 'bpp-0142', '2026-09-21T08:30:00.000Z'), // case-insensitive, like the server
    ]);
    const queue = new OfflineQueue(store);
    queue.register('attendance.punch_in', async () => ({ outcome: 'PARKED', reason: 'CLOCK_SKEW' }));
    const outSender = vi.fn(applied);
    queue.register('attendance.punch_out', outSender);

    await queue.replay();

    expect(outSender).not.toHaveBeenCalled();
    expect(await store.get('out')).toMatchObject({ status: 'PARKED', reason: 'PREDECESSOR_PARKED' });
  });

  it('a parked clock-in from an EARLIER stored pass also holds only that person’s clock-out', async () => {
    const store = memoryStore([
      { ...punch('a-in', 'attendance.punch_in', 'A-1', '2026-09-21T00:30:00.000Z'), status: 'PARKED', reason: 'BADGE_UNKNOWN' },
      punch('a-out', 'attendance.punch_out', 'A-1', '2026-09-21T08:30:00.000Z'),
      punch('b-out', 'attendance.punch_out', 'B-2', '2026-09-21T08:31:00.000Z'),
    ]);
    const queue = new OfflineQueue(store);
    const sent: string[] = [];
    queue.register('attendance.punch_out', async (i) => (sent.push(i.key), applied()));

    await queue.replay();

    expect(sent).toEqual(['b-out']);
    expect(await store.get('a-out')).toMatchObject({ reason: 'PREDECESSOR_PARKED' });
  });
});

describe('the snapshot the indicator renders (§B.8)', () => {
  it('counts pending and failed separately', async () => {
    const store = memoryStore([
      item({ key: 'k1' }),
      item({ key: 'k2' }),
      item({ key: 'k3', status: 'PARKED', reason: 'ORDER_CLOSED' }),
    ]);
    const queue = new OfflineQueue(store);

    const snapshot = await queue.snapshot();

    expect(snapshot.pending).toBe(2);
    expect(snapshot.failed).toBe(1);
  });

  it('notifies subscribers when a write is enqueued', async () => {
    const queue = new OfflineQueue(memoryStore());
    const seen: number[] = [];
    queue.subscribe((s) => seen.push(s.pending));

    await queue.enqueue({
      key: newIdempotencyKey(),
      kind: 'production.log',
      payload: {},
      clientRecordedAt: new Date().toISOString(),
    });

    expect(seen.at(-1)).toBe(1);
  });
});

describe('retry and discard', () => {
  it('a human retry clears the park and lets it through next pass', async () => {
    const store = memoryStore([item({ key: 'k1', status: 'PARKED', reason: 'ORDER_CLOSED' })]);
    const queue = new OfflineQueue(store);
    const sender = vi.fn(applied);
    queue.register('production.log', sender);

    await queue.retry('k1');
    await queue.replay();

    expect(sender).toHaveBeenCalledTimes(1);
    expect(await store.get('k1')).toBeUndefined();
  });
});

describe('who may ask for a retry (D17 — mirrors the server)', () => {
  const parked = (reason: string, status: QueuedItem['status'] = 'PARKED') => item({ status, reason: reason as QueuedItem['reason'] });

  it.each(['ORDER_CLOSED', 'PHASE_SIGNED_OFF', 'PHASE_NOT_ACTIVE', 'PHASE_AMBIGUOUS', 'FORBIDDEN', 'UNKNOWN'])(
    'offers a retry for %s — the world can change without anyone overriding a control',
    (reason) => expect(canRetry(parked(reason))).toBe(true),
  );

  it('offers a retry for a write held behind a parked predecessor', () => {
    expect(canRetry(parked('PREDECESSOR_PARKED'))).toBe(true);
  });

  it.each(['CLEARANCE_EXPIRED', 'LINE_NOT_CLEARED', 'CLOCK_SKEW'])(
    'does NOT offer a retry for %s — a re-tap must not stand in for the audited override',
    (reason) => expect(canRetry(parked(reason))).toBe(false),
  );

  it('never offers a retry for a REJECTED entry, whatever its reason', () => {
    expect(canRetry(parked('MALFORMED', 'REJECTED'))).toBe(false);
    expect(canRetry(parked('ORDER_CLOSED', 'REJECTED'))).toBe(false);
  });

  it('never offers a retry for a write that is not held', () => {
    expect(canRetry(item({ status: 'PENDING' }))).toBe(false);
  });

  it('refuses retry() for a clearance hold and leaves the item exactly as it was', async () => {
    const held = item({ key: 'k1', status: 'PARKED', reason: 'CLEARANCE_EXPIRED' });
    const store = memoryStore([held]);
    const queue = new OfflineQueue(store);
    const sender = vi.fn(applied);
    queue.register('production.log', sender);

    expect(await queue.retry('k1')).toBe(false);
    await queue.replay();

    expect(sender).not.toHaveBeenCalled();
    expect(await store.get('k1')).toEqual(held);
  });

  it('sends the human ask with the retry, and spends it once the server answers with a verdict', async () => {
    const store = memoryStore([item({ key: 'k1', status: 'PARKED', reason: 'ORDER_CLOSED' })]);
    const queue = new OfflineQueue(store);
    const seen: Array<boolean | undefined> = [];
    queue.register('production.log', async (i) => {
      seen.push(i.humanRetry);
      return { outcome: 'PARKED', reason: 'ORDER_CLOSED', detail: 'still closed' };
    });

    expect(await queue.retry('k1')).toBe(true);
    await queue.replay();

    expect(seen).toEqual([true]);
    expect((await store.get('k1'))?.humanRetry).toBeUndefined();
  });

  it('carries who queued the write, and on which device, from the envelope', async () => {
    const store = memoryStore();
    const queue = new OfflineQueue(store);

    await queue.enqueue(
      { key: newIdempotencyKey(), kind: 'production.log', payload: {}, clientRecordedAt: '2026-09-19T06:00:00.000Z', queuedBy: 'user-1', deviceId: 'device-9' },
      'Polar 115',
    );

    expect((await store.all())[0]).toMatchObject({ queuedBy: 'user-1', deviceId: 'device-9', label: 'Polar 115' });
  });
});

describe('backoff', () => {
  it('grows with attempts and stays under the cap', () => {
    const noJitter = () => 1;
    expect(backoffMs(1, noJitter)).toBe(1_000);
    expect(backoffMs(2, noJitter)).toBe(2_000);
    expect(backoffMs(20, noJitter)).toBe(60_000);
  });

  it('applies jitter so a fleet of tablets does not reconnect in lockstep', () => {
    expect(backoffMs(3, () => 0)).toBeLessThan(backoffMs(3, () => 1));
  });
});

describe('punch park reasons need a person, not a re-tap (D17, D21)', () => {
  it.each(['BADGE_UNKNOWN', 'EMPLOYEE_INACTIVE', 'CORRECTION_WINDOW_CLOSED'])(
    '%s offers no retry',
    (reason) => {
      expect(canRetry(item({ status: 'PARKED', reason: reason as QueuedItem['reason'] }))).toBe(false);
    },
  );
});
