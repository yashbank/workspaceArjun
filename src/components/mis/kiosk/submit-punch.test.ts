import { describe, expect, it, vi } from 'vitest';

import { memoryStore, OfflineQueue, type SendResult } from '@/lib/mis/offline/queue';

import { submitKioskPunch } from './submit-punch';

const T0 = new Date('2026-09-21T00:34:00.000Z'); // 06:04 IST — the tap
const T1 = new Date('2026-09-21T02:11:00.000Z'); // 07:41 IST — when signal returns

function setup(overrides: Partial<Parameters<typeof submitKioskPunch>[1]> = {}) {
  const store = memoryStore();
  const queue = new OfflineQueue(store);
  const live = vi.fn();
  let n = 0;
  const deps = {
    queue,
    live: live as never,
    online: () => true,
    timeoutMs: 20,
    deviceId: () => 'tablet-1',
    now: () => T0,
    newKey: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    ...overrides,
  };
  const input = { direction: 'IN' as const, badgeCode: 'BPP-0142', userId: 'u1', label: 'Ramesh Kumar · in' };
  return { store, queue, live, deps, input };
}

describe('the punch goes straight through when there is signal', () => {
  it('APPLIED and DUPLICATE both read as done, and nothing is queued', async () => {
    for (const outcome of ['APPLIED', 'DUPLICATE']) {
      const { store, live, deps, input } = setup();
      live.mockResolvedValue({ outcome, result: { punchId: 'p1' } });
      expect(await submitKioskPunch(input, deps)).toMatchObject({ kind: 'APPLIED', punchedAt: T0.toISOString() });
      expect(await store.all()).toEqual([]);
    }
  });

  it('sends the punch as the DEVICE’s moment, the right kind, and only the fields it should', async () => {
    const { live, deps, input } = setup();
    live.mockResolvedValue({ outcome: 'APPLIED' });
    await submitKioskPunch({ ...input, direction: 'OUT', shiftId: 's1', operatorId: 'op1' }, deps);
    expect(live.mock.calls[0][0]).toEqual({
      key: '00000000-0000-4000-8000-000000000001',
      kind: 'attendance.punch_out',
      payload: { badgeCode: 'BPP-0142', shiftId: 's1', operatorId: 'op1' },
      clientRecordedAt: T0.toISOString(),
      deviceId: 'tablet-1',
      queuedBy: 'u1',
    });
  });

  it('leaves out a shift or operator that was not given rather than sending undefined', async () => {
    const { live, deps, input } = setup();
    live.mockResolvedValue({ outcome: 'APPLIED' });
    await submitKioskPunch(input, deps);
    expect(live.mock.calls[0][0].payload).toEqual({ badgeCode: 'BPP-0142' });
  });

  it('a live refusal is BLOCKED with its reason and records NOTHING — the operator can fix it and tap again (§B.10.1)', async () => {
    const { store, live, deps, input } = setup();
    live.mockResolvedValue({ outcome: 'PARKED', reason: 'CORRECTION_WINDOW_CLOSED', detail: '2026-09-17 is past the 3-day correction window.' });
    expect(await submitKioskPunch(input, deps)).toMatchObject({ kind: 'BLOCKED', reason: 'CORRECTION_WINDOW_CLOSED' });
    expect(await store.all()).toEqual([]);
  });
});

describe('with no signal it is SAVED ON THE TABLET, under one key, at the moment of the tap (K2, D15)', () => {
  it('offline: never calls the server, queues the punch with the tap time, says QUEUED', async () => {
    const { store, live, deps, input } = setup({ online: () => false });

    const out = await submitKioskPunch(input, deps);

    expect(out).toEqual({ kind: 'QUEUED', punchedAt: T0.toISOString() });
    expect(live).not.toHaveBeenCalled();
    const [held] = await store.all();
    expect(held).toMatchObject({
      kind: 'attendance.punch_in',
      clientRecordedAt: T0.toISOString(), // 06:04 — not the 07:41 it will be sent at
      payload: { badgeCode: 'BPP-0142' },
      deviceId: 'tablet-1',
      queuedBy: 'u1',
      label: 'Ramesh Kumar · in',
    });
  });

  it('a dead link (throws) queues under the SAME key the live attempt used — a retry can never become a second punch', async () => {
    const { store, live, deps, input } = setup();
    live.mockRejectedValue(new Error('fetch failed'));
    expect(await submitKioskPunch(input, deps)).toMatchObject({ kind: 'QUEUED' });
    const attemptedKey = live.mock.calls[0][0].key;
    expect((await store.all())[0].key).toBe(attemptedKey);
  });

  it('a connected-but-dead link times out and queues under the same key', async () => {
    const { store, live, deps, input } = setup();
    live.mockReturnValue(new Promise(() => undefined)); // never answers
    const out = await submitKioskPunch(input, deps);
    expect(out).toMatchObject({ kind: 'QUEUED' });
    expect((await store.all())[0].key).toBe(live.mock.calls[0][0].key);
  });

  it('a server RETRY (busy, or signed out) is queued, not shown as a failure', async () => {
    const { store, live, deps, input } = setup();
    live.mockResolvedValue({ outcome: 'RETRY', detail: 'busy' });
    expect(await submitKioskPunch(input, deps)).toMatchObject({ kind: 'QUEUED' });
    expect(await store.all()).toHaveLength(1);
  });

  it('NOT_SAVED when the tablet cannot hold it — the one outcome that must never look like success', async () => {
    const { queue, deps, input } = setup({ online: () => false });
    vi.spyOn(queue, 'enqueue').mockRejectedValue(new Error('storage full'));
    const out = await submitKioskPunch(input, deps);
    expect(out).toMatchObject({ kind: 'NOT_SAVED', detail: expect.stringContaining('storage full') });
  });
});

describe('the key is made at the tap', () => {
  it('a fresh key per tap — and ONE key per tap, however it is delivered', async () => {
    const { live, deps, input } = setup();
    live.mockResolvedValue({ outcome: 'APPLIED' });
    await submitKioskPunch(input, deps);
    await submitKioskPunch({ ...input, badgeCode: 'BPP-0150' }, deps);
    const keys = live.mock.calls.map((c) => c[0].key);
    expect(new Set(keys).size).toBe(2);
  });

  it('takes the clock ONCE, at the tap: a slow attempt does not move the punch later', async () => {
    const times = [T0, T1];
    const now = vi.fn(() => times.shift() ?? T1);
    const { live, deps, input } = setup({ now });
    live.mockResolvedValue({ outcome: 'APPLIED' });
    await submitKioskPunch(input, deps);
    expect(now).toHaveBeenCalledTimes(1);
    expect(live.mock.calls[0][0].clientRecordedAt).toBe(T0.toISOString());
  });
});

describe('end to end through the real queue: a 06:04 punch that syncs at 07:41 is a 06:04 punch (K2)', () => {
  it('is held offline, then delivered later with its ORIGINAL time and the SAME key', async () => {
    const { queue, deps, input } = setup({ online: () => false });
    await submitKioskPunch(input, deps);

    const delivered: { key: string; at: string }[] = [];
    queue.register('attendance.punch_in', async (item): Promise<SendResult> => {
      delivered.push({ key: item.key, at: item.clientRecordedAt });
      return { outcome: 'APPLIED' };
    });
    await queue.replay(T1.getTime()); // signal returns at 07:41

    expect(delivered).toEqual([{ key: '00000000-0000-4000-8000-000000000001', at: T0.toISOString() }]);
  });
});
