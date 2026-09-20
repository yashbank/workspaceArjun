import { afterEach, describe, expect, it, vi } from 'vitest';

import { newIdempotencyKey } from '@/lib/mis/offline/idempotency';
import { memoryStore, OfflineQueue, type SendResult } from '@/lib/mis/offline/queue';

// The action file is a 'use server' module that pulls in the database; the helper
// only needs its shape, so the whole module is replaced.
vi.mock('@/app/(mis)/mis/production/actions', () => ({ submitProductionLiveAction: vi.fn() }));

const { submitProduction, isClearanceBlock, LIVE_TIMEOUT_MS } = await import('./submit-production');

const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const payload = { orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', machineId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', qtyProduced: 100 };

type Live = NonNullable<Parameters<typeof submitProduction>[1]>['live'];

function setup(overrides: { online?: boolean; live?: Live; timeoutMs?: number } = {}) {
  const store = memoryStore();
  const queue = new OfflineQueue(store);
  const replay = vi.spyOn(queue, 'replay').mockResolvedValue();
  const live = (overrides.live ?? vi.fn(async () => ({ outcome: 'APPLIED' as const }))) as NonNullable<Live>;
  const key = newIdempotencyKey();
  const run = () =>
    submitProduction(
      { key, payload, userId: USER },
      {
        queue,
        live,
        online: () => overrides.online ?? true,
        timeoutMs: overrides.timeoutMs ?? 50,
        deviceId: () => 'tablet-1',
        now: () => new Date('2026-09-20T06:04:00.000Z'),
      },
    );
  return { store, queue, replay, live, key, run };
}

afterEach(() => vi.useRealTimers());

describe('online: straight through (offline-capable, not offline-only — MIS-86)', () => {
  it('sends live and does not touch the queue', async () => {
    const { run, live, store } = setup();

    expect(await run()).toEqual({ kind: 'APPLIED' });
    expect(live).toHaveBeenCalledTimes(1);
    expect(await store.all()).toHaveLength(0);
  });

  it('sends the envelope the server needs: key, kind, actor, device and the tap time', async () => {
    const { run, live, key } = setup();
    await run();
    expect(vi.mocked(live).mock.calls[0][0]).toEqual({
      key,
      kind: 'production.log',
      payload,
      clientRecordedAt: '2026-09-20T06:04:00.000Z',
      deviceId: 'tablet-1',
      queuedBy: USER,
    });
  });

  it('never sends a phase — it is re-resolved on the server at replay, not trusted from a device', async () => {
    const { run, live } = setup();
    await run();
    expect(JSON.stringify(vi.mocked(live).mock.calls[0][0])).not.toMatch(/jobPhase/i);
  });

  it('treats a DUPLICATE as success — it already landed', async () => {
    const { run } = setup({ live: vi.fn(async () => ({ outcome: 'DUPLICATE' as const })) });
    expect(await run()).toEqual({ kind: 'APPLIED' });
  });
});

describe('a gate refuses it live: back to the person, nothing queued (§B.10.1)', () => {
  it('returns BLOCKED with the reason and the sentence, and does not queue', async () => {
    const { run, store } = setup({
      live: vi.fn(async () => ({
        outcome: 'PARKED' as const,
        reason: 'CLEARANCE_MISSING' as const,
        detail: 'Polar 115 Cutter needs a line clearance before production can be logged.',
      })),
    });

    const outcome = await run();

    expect(outcome).toEqual({
      kind: 'BLOCKED',
      reason: 'CLEARANCE_MISSING',
      detail: 'Polar 115 Cutter needs a line clearance before production can be logged.',
    });
    expect(await store.all()).toHaveLength(0);
  });

  it('a REJECTED entry is blocked too, not queued — waiting cannot fix it', async () => {
    const { run, store } = setup({
      live: vi.fn(async () => ({ outcome: 'REJECTED' as const, reason: 'MACHINE_MISSING' as const, detail: 'no machine' })),
    });
    expect(await run()).toMatchObject({ kind: 'BLOCKED', reason: 'MACHINE_MISSING' });
    expect(await store.all()).toHaveLength(0);
  });

  it('says which refusals the Clear-the-line button can address', () => {
    expect(isClearanceBlock('CLEARANCE_EXPIRED')).toBe(true);
    expect(isClearanceBlock('CLEARANCE_MISSING')).toBe(true);
    expect(isClearanceBlock('ORDER_CLOSED')).toBe(false);
    expect(isClearanceBlock(undefined)).toBe(false);
  });
});

describe('no signal: saved on this device, same key (Appendix B §B.2)', () => {
  it('goes straight to the queue when the browser says it is offline', async () => {
    const { run, live, store, key } = setup({ online: false });

    expect(await run()).toEqual({ kind: 'QUEUED' });
    expect(live).not.toHaveBeenCalled();
    const [item] = await store.all();
    expect(item).toMatchObject({ key, kind: 'production.log', status: 'PENDING', queuedBy: USER, deviceId: 'tablet-1' });
    expect(item.clientRecordedAt).toBe('2026-09-20T06:04:00.000Z');
  });

  it('queues under the SAME key when the live request dies — the case the key exists for', async () => {
    const { run, store, key } = setup({
      live: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    });

    expect(await run()).toEqual({ kind: 'QUEUED' });
    expect((await store.all())[0].key).toBe(key);
  });

  it('queues when the link is connected but dead, rather than spinning for a minute', async () => {
    const never = new Promise<never>(() => undefined);
    const { run, store, key } = setup({ live: vi.fn(() => never) as never, timeoutMs: 20 });

    expect(await run()).toEqual({ kind: 'QUEUED' });
    expect((await store.all())[0].key).toBe(key);
  });

  it('queues on a transient server-side RETRY, such as a signed-out session', async () => {
    const { run, store } = setup({ live: vi.fn(async () => ({ outcome: 'RETRY' as const, detail: 'signed out' })) });
    expect(await run()).toEqual({ kind: 'QUEUED' });
    expect(await store.all()).toHaveLength(1);
  });

  it('kicks a replay pass after saving, so a merely slow link sends it now', async () => {
    const { run, replay } = setup({ online: false });
    await run();
    expect(replay).toHaveBeenCalled();
  });

  it('never reports success when it could not save — the form must keep its values', async () => {
    const { run, queue } = setup({ online: false });
    vi.spyOn(queue, 'enqueue').mockRejectedValue(new Error('QuotaExceededError'));

    const outcome = await run();

    expect(outcome.kind).toBe('NOT_SAVED');
    expect('detail' in outcome && outcome.detail).toMatch(/could not hold the entry/);
  });

  it('leaves no timer behind when the live call wins', async () => {
    vi.useFakeTimers();
    const { run } = setup({ timeoutMs: LIVE_TIMEOUT_MS });
    await run();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('aeroplane mode to reconnect: exactly once, in the end (MIS-155)', () => {
  it('a write made offline lands once on reconnect, even if it is sent twice', async () => {
    const { run, store, queue } = setup({ online: false });
    vi.mocked(queue.replay).mockRestore();

    await run();
    expect(await store.all()).toHaveLength(1); // pending, returned immediately

    // The server, as Phase 10 built it: the first send applies, every later one is a duplicate.
    const applied = new Set<string>();
    const sender = vi.fn(async (item: { key: string }): Promise<SendResult> => {
      const first = !applied.has(item.key);
      applied.add(item.key);
      return { outcome: first ? 'APPLIED' : 'DUPLICATE' };
    });
    queue.register('production.log', sender);

    await queue.replay();

    expect(await store.all()).toHaveLength(0);
    expect(applied.size).toBe(1);
  });
});
