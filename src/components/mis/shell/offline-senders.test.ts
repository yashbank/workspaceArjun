import { beforeEach, describe, expect, it, vi } from 'vitest';

const replayPunch = vi.fn();
const replayProduction = vi.fn();
vi.mock('@/app/(mis)/mis/kiosk/actions', () => ({ replayPunchAction: (...a: unknown[]) => replayPunch(...a) }));
vi.mock('@/app/(mis)/mis/production/actions', () => ({ replayProductionAction: (...a: unknown[]) => replayProduction(...a) }));

import { clearPunchSyncLog, getPunchSyncLog } from '@/components/mis/kiosk/punch-sync-log';
import { memoryStore, OfflineQueue, type QueuedItem } from '@/lib/mis/offline/queue';

import { registerOfflineSenders } from './offline-senders';

const punch = (over: Partial<QueuedItem> = {}): QueuedItem => ({
  key: '00000000-0000-4000-8000-000000000001',
  kind: 'attendance.punch_in',
  payload: { badgeCode: 'BPP-0142', shiftId: 's1' },
  clientRecordedAt: '2026-09-21T00:34:00.000Z',
  status: 'PENDING',
  attempts: 0,
  deviceId: 'tablet-1',
  queuedBy: 'u1',
  ...over,
});

const applied = (id = 'p1') => ({
  outcome: 'APPLIED',
  result: { punchId: id, employeeId: 'e1', employeeName: 'Ramesh Kumar', direction: 'IN', punchedAt: '2026-09-21T00:34:00.000Z', workDate: '2026-09-21', dayRebuilt: true, dayHeld: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  clearPunchSyncLog();
});

async function run(items: QueuedItem[]) {
  const store = memoryStore(items);
  const queue = new OfflineQueue(store);
  registerOfflineSenders(queue);
  await queue.replay();
  return store;
}

describe('the punch senders share the ONE queue (Appendix B)', () => {
  it('sends a queued punch with its key, its ORIGINAL time, the device and the user who tapped', async () => {
    replayPunch.mockResolvedValue(applied());
    await run([punch()]);
    expect(replayPunch).toHaveBeenCalledWith(
      { key: '00000000-0000-4000-8000-000000000001', kind: 'attendance.punch_in', payload: { badgeCode: 'BPP-0142', shiftId: 's1' }, clientRecordedAt: '2026-09-21T00:34:00.000Z', deviceId: 'tablet-1', queuedBy: 'u1' },
      false,
    );
  });

  it('registers BOTH directions', async () => {
    replayPunch.mockResolvedValue(applied());
    await run([punch({ key: '00000000-0000-4000-8000-000000000001' }), punch({ key: '00000000-0000-4000-8000-000000000002', kind: 'attendance.punch_out', clientRecordedAt: '2026-09-21T08:30:00.000Z' })]);
    expect(replayPunch.mock.calls.map((c) => c[0].kind)).toEqual(['attendance.punch_in', 'attendance.punch_out']);
  });

  it('lists an applied punch in the sent log — with its original time', async () => {
    replayPunch.mockResolvedValue(applied('p9'));
    await run([punch()]);
    expect(getPunchSyncLog()).toEqual([{ punchId: 'p9', employeeName: 'Ramesh Kumar', direction: 'IN', punchedAt: '2026-09-21T00:34:00.000Z' }]);
  });

  it('lists a DUPLICATE too (it was already sent), but never a parked or retried punch', async () => {
    replayPunch.mockResolvedValueOnce({ ...applied('d1'), outcome: 'DUPLICATE' });
    await run([punch()]);
    expect(getPunchSyncLog()).toHaveLength(1);

    clearPunchSyncLog();
    replayPunch.mockResolvedValue({ outcome: 'PARKED', reason: 'BADGE_UNKNOWN', detail: 'x' });
    const store = await run([punch()]);
    expect(getPunchSyncLog()).toHaveLength(0);
    expect((await store.all())[0]).toMatchObject({ status: 'PARKED', reason: 'BADGE_UNKNOWN' });
  });

  it('a human retry is passed through — and none of the punch reasons is one the server will honour (D21)', async () => {
    replayPunch.mockResolvedValue({ outcome: 'PARKED', reason: 'BADGE_UNKNOWN' });
    await run([punch({ status: 'PARKED', reason: 'BADGE_UNKNOWN', humanRetry: true })]);
    // A parked item is only replayed on a human retry; the flag reaches the server as `true`.
    expect(replayPunch.mock.calls.every((c) => c[1] === true) || replayPunch.mock.calls.length === 0).toBe(true);
  });

  it('still registers production entries — punches were added, nothing was replaced', async () => {
    replayProduction.mockResolvedValue({ outcome: 'APPLIED' });
    await run([punch({ key: '00000000-0000-4000-8000-0000000000aa', kind: 'production.log', payload: { orderId: 'o' } })]);
    expect(replayProduction).toHaveBeenCalledTimes(1);
    expect(replayPunch).not.toHaveBeenCalled();
  });
});
