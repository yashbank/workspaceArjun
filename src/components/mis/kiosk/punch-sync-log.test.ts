import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PunchResult } from '@/server/mis/attendance-punch';

import { clearPunchSyncLog, getPunchSyncLog, recordPunchSent, subscribePunchSyncLog } from './punch-sync-log';

const result = (id: string, at = '2026-09-21T00:34:00.000Z'): PunchResult => ({
  punchId: id, employeeId: 'e1', employeeName: 'Ramesh Kumar', direction: 'IN', punchedAt: at, workDate: '2026-09-21', dayRebuilt: true, dayHeld: null,
});

beforeEach(() => clearPunchSyncLog());

describe('the sent-punch log (K2’s sent rows)', () => {
  it('lists a sent punch with its ORIGINAL time — a 06:04 punch synced at 07:41 is listed as 06:04', () => {
    recordPunchSent(result('p1', '2026-09-21T00:34:00.000Z'));
    expect(getPunchSyncLog()[0]).toMatchObject({ employeeName: 'Ramesh Kumar', punchedAt: '2026-09-21T00:34:00.000Z' });
  });

  it('lists a punch once even when the server answers DUPLICATE for it again', () => {
    recordPunchSent(result('p1'));
    recordPunchSent(result('p1'));
    expect(getPunchSyncLog()).toHaveLength(1);
  });

  it('gives a stable reference until something changes, as useSyncExternalStore requires', () => {
    recordPunchSent(result('p1'));
    expect(getPunchSyncLog()).toBe(getPunchSyncLog());
  });

  it('notifies subscribers, and stops when they leave', () => {
    const listener = vi.fn();
    const off = subscribePunchSyncLog(listener);
    recordPunchSent(result('p1'));
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    recordPunchSent(result('p2'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('“Back to scanning” clears the display, and clearing an empty log is quiet', () => {
    const listener = vi.fn();
    recordPunchSent(result('p1'));
    subscribePunchSyncLog(listener);
    clearPunchSyncLog();
    clearPunchSyncLog();
    expect(getPunchSyncLog()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps a bounded list so a long shift cannot grow without limit', () => {
    for (let i = 0; i < 260; i++) recordPunchSent(result(`p${i}`));
    expect(getPunchSyncLog().length).toBe(200);
    expect(getPunchSyncLog().at(-1)!.punchId).toBe('p259');
  });
});
