import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R3-ATT (B59, B60 pull half, B61): the kiosk routes and device functions.
 */

const DEVICE_ID = '00000000-0000-4000-8000-0000000000aa';
const POLL_SECRET = `mks_${'B'.repeat(43)}`;
const TOKEN = `mkd_${'C'.repeat(43)}`;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

const world = {
  device: { id: DEVICE_ID, status: 'ACTIVE', name: 'GATE-02', pollSecretHash: sha(POLL_SECRET), tokenHash: sha(TOKEN) as string | null, pairingExpiresAt: null },
};

vi.mock('@/server/db', () => ({
  db: {
    misKioskDevice: {
      findUnique: async ({ where }: { where: { id?: string; tokenHash?: string } }) =>
        where.id === DEVICE_ID || where.tokenHash === world.device.tokenHash ? { ...world.device } : null,
      updateMany: async () => ({ count: 0 }),
      update: async () => ({}),
    },
    misEmployee: { findMany: async () => [] },
    misShift: { findMany: async () => [{ id: 's1', name: 'Day', startTime: '06:00', endTime: '14:00' }] },
    misWorkerAllocation: { findMany: async () => [] },
    misAttendance: { findMany: async () => [] },
  },
}));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));

const ingest = vi.fn();
vi.mock('@/server/mis/attendance-punch', () => ({ ingestDevicePunch: (...a: unknown[]) => ingest(...a) }));

const kiosk = await import('./kiosk-device');
const punchRoute = await import('@/app/api/mis/kiosk/punch/route');
const pullRoute = await import('@/app/api/mis/kiosk/pull/route');

const post = (url: string, text: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: 'POST', headers, body: text });

beforeEach(() => {
  vi.clearAllMocks();
  world.device.tokenHash = sha(TOKEN);
});

describe('B59 body limits', () => {
  it('a 17 KB punch body is 413 PAYLOAD_TOO_LARGE, never coerced to {} and never ingested', async () => {
    const big = JSON.stringify({ key: 'x', pad: 'a'.repeat(17 * 1024) });
    ingest.mockResolvedValue({ outcome: 'REJECTED' });
    const res = await punchRoute.POST(post('/api/mis/kiosk/punch', big, { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'PAYLOAD_TOO_LARGE' });
    // the only call is the empty-envelope authentication probe, never the oversized body
    for (const call of ingest.mock.calls) expect(call[1]).toEqual({});
  });

  it('a 15 KB valid punch body is passed on and applied', async () => {
    const payload = { key: 'k', health: { note: 'a'.repeat(15 * 1024) } };
    ingest.mockResolvedValue({ outcome: 'APPLIED', result: { punchId: 'p1' } });
    const res = await punchRoute.POST(post('/api/mis/kiosk/punch', JSON.stringify(payload), { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
    expect(ingest).toHaveBeenCalledWith(`Bearer ${TOKEN}`, payload);
  });

  it('the other kiosk routes keep the 4 KB limit and answer 413 past it', async () => {
    const res = await pullRoute.POST(post('/api/mis/kiosk/pull', JSON.stringify({ pad: 'a'.repeat(5 * 1024) }), { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(413);
  });

  it('a declared content-length over the limit is refused without reading the body', async () => {
    const res = await pullRoute.POST(post('/api/mis/kiosk/pull', '{}', { authorization: `Bearer ${TOKEN}`, 'content-length': '999999' }));
    expect(res.status).toBe(413);
  });
});

describe('B60 the pull carries the factory timezone', () => {
  it('adds factoryTimezone and keeps the shift windows', async () => {
    const out = await kiosk.pullForDevice(`Bearer ${TOKEN}`, {});
    expect(out.factoryTimezone).toBe('Asia/Kolkata');
    expect(out.shifts).toEqual([{ id: 's1', name: 'Day', startTime: '06:00', endTime: '14:00' }]);
  });
});

describe('B61 ALREADY_CLAIMED', () => {
  it('names the tablet and says how to re-pair, and issues no token', async () => {
    const out = await kiosk.claimEnrolment({ deviceId: DEVICE_ID, pollSecret: POLL_SECRET });
    expect(out).toEqual({
      status: 'ALREADY_CLAIMED',
      detail: 'This code was already used. Ask an Admin to retire GATE-02 in Settings → Devices, then pair again.',
    });
    expect(JSON.stringify(out)).not.toContain('mkd_');
  });
});
