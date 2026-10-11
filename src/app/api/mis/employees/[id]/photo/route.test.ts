import { beforeEach, describe, expect, it, vi } from 'vitest';

const forDevice = vi.fn();
const forUser = vi.fn();
vi.mock('@/server/mis/employee-photo', () => ({
  getEmployeePhotoForDevice: (...a: unknown[]) => forDevice(...a),
  getEmployeePhoto: (...a: unknown[]) => forUser(...a),
}));

const { KioskDeviceError } = await import('@/server/mis/kiosk-device');
const { GET } = await import('./route');

const ID = '123e4567-e89b-42d3-a456-426614174000';
const call = (headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/mis/employees/${ID}/photo`, { headers }), { params: Promise.resolve({ id: ID }) });

beforeEach(() => vi.clearAllMocks());

describe('the photo route answers a tablet in JSON, never HTML', () => {
  it('a bad or revoked device token is 401 JSON (not a redirect, not 200)', async () => {
    forDevice.mockRejectedValue(new KioskDeviceError('UNAUTHORIZED', 'bad token'));
    const res = await call({ authorization: 'Bearer mkd_bad' });
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('an absent token takes the session path and is never served as an image', async () => {
    forUser.mockRejectedValue(new Error('no session'));
    const res = await call();
    expect(forDevice).not.toHaveBeenCalled();
    expect(res.headers.get('content-type') ?? '').not.toContain('image/');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('a good token gets image/webp, private', async () => {
    forDevice.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const res = await call({ authorization: 'Bearer mkd_ok' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('private');
  });
});
