import { beforeEach, describe, expect, it, vi } from 'vitest';

const ingest = vi.fn();
vi.mock('@/server/mis/attendance-punch', () => ({ ingestDevicePunch: (...a: unknown[]) => ingest(...a) }));

const { POST } = await import('./route');

const call = (headers: Record<string, string> = { authorization: `Bearer mkd_${'A'.repeat(43)}` }) =>
  POST(new Request('http://localhost/api/mis/kiosk/punch', { method: 'POST', headers, body: JSON.stringify({ k: 1 }) }));

beforeEach(() => vi.clearAllMocks());

describe('the punch route is a thin translation of the verdict', () => {
  it('hands the Authorization header and parsed body to the server function, and nothing else', async () => {
    ingest.mockResolvedValue({ outcome: 'APPLIED', result: { punchId: 'p1' } });
    await call();
    expect(ingest).toHaveBeenCalledWith(`Bearer mkd_${'A'.repeat(43)}`, { k: 1 });
  });

  it.each(['APPLIED', 'DUPLICATE', 'PARKED', 'REJECTED'])('%s comes back 200 with the reason the tablet shows (K2)', async (outcome) => {
    ingest.mockResolvedValue({ outcome, reason: 'BADGE_UNKNOWN', detail: 'Badge not recognised. Scanned 06:47 · code BPP-8841.' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome, reason: 'BADGE_UNKNOWN', detail: expect.stringContaining('06:47') });
  });

  it('RETRY is a 503, so a client that knows nothing of the contract still backs off', async () => {
    ingest.mockResolvedValue({ outcome: 'RETRY', detail: 'busy' });
    expect((await call()).status).toBe(503);
  });

  it('R2-181: a retired tablet is told so on the same contact (200 keeps the punch, REVOKED + wipe tells it to lock)', async () => {
    ingest.mockResolvedValue({ outcome: 'PARKED', reason: 'DEVICE_REVOKED', deviceRevoked: true });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: 'PARKED', error: 'REVOKED', wipe: true });
  });

  it('an active tablet gets no REVOKED marker', async () => {
    ingest.mockResolvedValue({ outcome: 'APPLIED', result: { punchId: 'p1' } });
    expect(await (await call()).json()).not.toHaveProperty('wipe');
  });

  it('never caches, and says nothing about an unexpected failure', async () => {
    ingest.mockRejectedValue(new Error('relation "mis_attendance_punches" does not exist'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(await res.json())).toBe('{"error":"SERVER_ERROR"}');
  });
});
