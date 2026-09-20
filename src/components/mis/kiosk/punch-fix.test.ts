import { describe, expect, it, vi } from 'vitest';

import { memoryStore, OfflineQueue, type QueuedItem } from '@/lib/mis/offline/queue';

import { fixUnknownBadge } from './punch-fix';

const SCAN = '2026-09-21T01:17:00.000Z'; // 06:47 IST

const parked = (over: Partial<QueuedItem> = {}): QueuedItem => ({
  key: 'held-key',
  kind: 'attendance.punch_in',
  payload: { badgeCode: 'BPP-8841', operatorId: 'op1', shiftId: 's1' },
  clientRecordedAt: SCAN,
  status: 'PARKED',
  attempts: 1,
  reason: 'BADGE_UNKNOWN',
  deviceId: 'tablet-1',
  queuedBy: 'u1',
  ...over,
});

const person = { employeeCode: 'BPP-0142', name: 'Ramesh Kumar' };
const setup = (item = parked()) => {
  const store = memoryStore([item]);
  return { store, queue: new OfflineQueue(store) };
};

describe('Fix records a CORRECTION — it never edits the held punch (K2)', () => {
  it('records a NEW punch under a NEW key for the right person, at the ORIGINAL scan time', async () => {
    const { store, queue } = setup();

    const out = await fixUnknownBadge(parked(), person, queue, () => 'new-key');

    expect(out).toEqual({ ok: true, key: 'new-key' });
    const all = await store.all();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      key: 'new-key',
      kind: 'attendance.punch_in',
      clientRecordedAt: SCAN, // 06:47 stays 06:47 however long it took to sort out (D15)
      payload: { badgeCode: 'BPP-0142', operatorId: 'op1', shiftId: 's1', correctsKey: 'held-key' },
      deviceId: 'tablet-1',
      queuedBy: 'u1',
    });
  });

  it('keeps a clock-OUT a clock-out', async () => {
    const { store, queue } = setup(parked({ kind: 'attendance.punch_out' }));
    await fixUnknownBadge(parked({ kind: 'attendance.punch_out' }), person, queue, () => 'k');
    expect((await store.all())[0].kind).toBe('attendance.punch_out');
  });

  it('saves the correction BEFORE dropping the held entry — a failure part-way loses nothing', async () => {
    const { store, queue } = setup();
    vi.spyOn(queue, 'enqueue').mockRejectedValue(new Error('storage full'));

    const out = await fixUnknownBadge(parked(), person, queue);

    expect(out).toMatchObject({ ok: false, detail: expect.stringContaining('untouched') });
    expect((await store.all()).map((i) => i.key)).toEqual(['held-key']);
  });

  it('refuses anything but an unrecognised badge — a closed day, a wrong clock or a leaver needs a person with authority (D21)', async () => {
    for (const reason of ['CORRECTION_WINDOW_CLOSED', 'CLOCK_SKEW', 'TOO_OLD', 'EMPLOYEE_INACTIVE', 'FORBIDDEN'] as const) {
      const item = parked({ reason });
      const { store, queue } = setup(item);
      expect(await fixUnknownBadge(item, person, queue)).toMatchObject({ ok: false });
      expect(await store.all()).toHaveLength(1); // untouched
    }
  });

  it('refuses an entry that is not parked, and one that is not a punch', async () => {
    const pending = parked({ status: 'PENDING' });
    expect(await fixUnknownBadge(pending, person, setup(pending).queue)).toMatchObject({ ok: false });
    const other = parked({ kind: 'production.log' });
    expect(await fixUnknownBadge(other, person, setup(other).queue)).toMatchObject({ ok: false });
  });
});
