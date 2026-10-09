/**
 * V2 Epic 7 — a badge photo is normalised to 256×256 WebP, stored under the employee's key, and
 * served to a signed-in reader or a paired tablet; nothing else may write one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const state: { employee: Row | null; puts: Row[]; updates: Row[] } = { employee: null, puts: [], updates: [] };
const resize = vi.fn();
vi.mock('sharp', () => ({
  default: () => {
    const chain: Row = {
      rotate: () => chain,
      resize: (...a: unknown[]) => { resize(...a); return chain; },
      webp: () => chain,
      toBuffer: async () => Buffer.from('WEBP-BYTES'),
    };
    return chain;
  },
}));
vi.mock('@/server/storage', () => ({
  putObject: async (key: string, body: Uint8Array, contentType: string) => { state.puts.push({ key, size: body.byteLength, contentType }); },
  getObject: async (key: string) => ({ bytes: new TextEncoder().encode(`stored:${key}`), contentType: 'image/webp', contentLength: 1 }),
}));
vi.mock('@/server/db', () => ({
  db: {
    misEmployee: {
      findUnique: async () => state.employee,
      update: async ({ data }: Row) => { state.updates.push(data); Object.assign(state.employee!, data); return state.employee; },
    },
  },
}));
vi.mock('./audit', () => ({ logAuditEvent: async () => undefined }));
const authenticateDevice = vi.fn();
vi.mock('./kiosk-device', () => ({ authenticateDevice: (...a: unknown[]) => authenticateDevice(...a) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { PHOTO_SIZE, getEmployeePhoto, getEmployeePhotoForDevice, setEmployeePhoto } = await import('./employee-photo');
const E1 = '11111111-1111-4111-8111-111111111111';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

beforeEach(() => {
  vi.clearAllMocks();
  state.employee = { id: E1, deletedAt: null, photoUrl: null }; state.puts = []; state.updates = [];
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ADMIN');
  authenticateDevice.mockResolvedValue({ id: 'd1', name: 'Gate' });
});

describe('setEmployeePhoto', () => {
  it('squares to 256, stores WebP under the employee key, and records the portal URL', async () => {
    const out = await setEmployeePhoto(E1, jpeg, 'image/jpeg');
    expect(resize).toHaveBeenCalledWith(PHOTO_SIZE, PHOTO_SIZE, expect.objectContaining({ fit: 'cover' }));
    expect(state.puts).toEqual([{ key: `mis/employees/${E1}/photo.webp`, size: 10, contentType: 'image/webp' }]);
    expect(out.photoUrl).toBe(`/api/mis/employees/${E1}/photo`);
    expect(state.updates).toEqual([{ photoUrl: out.photoUrl }]);
  });
  it('refuses a non-image, an empty file, an oversize file, and a reader without employees.write', async () => {
    await expect(setEmployeePhoto(E1, jpeg, 'application/pdf')).rejects.toThrow(/image/);
    await expect(setEmployeePhoto(E1, new Uint8Array(), 'image/png')).rejects.toThrow(/empty/);
    await expect(setEmployeePhoto(E1, new Uint8Array(5 * 1024 * 1024 + 1), 'image/png')).rejects.toThrow(/5 MB/);
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(setEmployeePhoto(E1, jpeg, 'image/jpeg')).rejects.toThrow(/Not permitted/);
    expect(state.puts).toEqual([]);
  });
});

describe('reading', () => {
  it('a signed-in reader and a paired tablet get the same bytes; no photo → null', async () => {
    expect(await getEmployeePhoto(E1)).toBeNull();
    state.employee!.photoUrl = '/x';
    expect(new TextDecoder().decode((await getEmployeePhoto(E1))!)).toBe(`stored:mis/employees/${E1}/photo.webp`);
    expect(new TextDecoder().decode((await getEmployeePhotoForDevice('Bearer mkd_x', E1))!)).toBe(`stored:mis/employees/${E1}/photo.webp`);
    expect(authenticateDevice).toHaveBeenCalledWith('Bearer mkd_x');
  });
  it('a revoked or unknown device is refused before anything is read', async () => {
    authenticateDevice.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));
    await expect(getEmployeePhotoForDevice('Bearer mkd_bad', E1)).rejects.toThrow(/Unauthorized/);
  });
});
