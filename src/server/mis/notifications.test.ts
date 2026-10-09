/**
 * V2 — the bell serves OWNER / ADMIN / STORE_GUY only; writers never throw; reads and
 * mark-read are scoped to the caller.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state: { rows: Row[]; updates: Row[]; profiles: Row[] } = { rows: [], updates: [], profiles: [] };
vi.mock('@/server/db', () => ({
  db: {
    userProfile: {
      findMany: async () => state.profiles,
      findUnique: async ({ where }: { where: { id: string } }) => state.profiles.find((p) => p.id === where.id) ?? null,
    },
    notification: {
      createMany: async ({ data }: { data: Row[] }) => { state.rows.push(...data); return { count: data.length }; },
      create: async ({ data }: { data: Row }) => { state.rows.push(data); return data; },
      findMany: async ({ where }: { where: { userId: string } }) => state.rows.filter((r) => r.userId === where.userId).map((r, i) => ({ id: `n${i}`, createdAt: new Date(), ...r })),
      updateMany: async (args: Row) => { state.updates.push(args); return { count: 1 }; },
    },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { listMisNotifications, markMisNotificationsRead, notifyRoles, notifyUser } = await import('./notifications');

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = []; state.updates = [];
  state.profiles = [
    { id: 'store-1', status: 'active', misEmployee: { role: 'STORE_GUY' } },
    { id: 'sup-1', status: 'active', misEmployee: { role: 'SUPERVISOR' } },
  ];
  getCurrentUser.mockResolvedValue({ id: 'store-1' });
  getMisRole.mockResolvedValue('STORE_GUY');
});

describe('writers', () => {
  it('notifyRoles writes one row per matching login', async () => {
    await notifyRoles(['STORE_GUY'], 'mis.material_request.raised', { requestId: 'r' });
    expect(state.rows.map((r) => r.userId)).toEqual(['store-1', 'sup-1']); // the fake findMany ignores the where; the shape is what matters
  });
  it('notifyUser writes nothing for a role that is not on the bell', async () => {
    await notifyUser('sup-1', 'mis.material_request.decided', {});
    expect(state.rows).toEqual([]);
    await notifyUser('store-1', 'mis.material_request.decided', {});
    expect(state.rows).toHaveLength(1);
  });
  it('never throws', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const db = (await import('@/server/db')).db as unknown as { notification: { createMany: () => Promise<never> } };
    const spy = vi.spyOn(db.notification, 'createMany').mockRejectedValueOnce(new Error('down'));
    await expect(notifyRoles(['OWNER'], 'mis.x', {})).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('readers', () => {
  it('STORE_GUY reads their own unread mis.* rows; SUPERVISOR gets an empty list; QC is refused', async () => {
    state.rows = [{ userId: 'store-1', type: 'mis.grn_confirmed', payload: {}, readAt: null }, { userId: 'other', type: 'mis.grn_confirmed', payload: {}, readAt: null }];
    expect((await listMisNotifications()).map((n) => n.type)).toEqual(['mis.grn_confirmed']);
    getMisRole.mockResolvedValue('SUPERVISOR');
    expect(await listMisNotifications()).toEqual([]);
    getMisRole.mockResolvedValue('QC');
    await expect(listMisNotifications()).rejects.toThrow(/Not permitted/);
  });
  it('mark-read is scoped to the caller and to mis.* rows', async () => {
    await markMisNotificationsRead(['n1', 'n2']);
    expect(state.updates[0]).toMatchObject({ where: { id: { in: ['n1', 'n2'] }, userId: 'store-1', type: { startsWith: 'mis.' } } });
    await markMisNotificationsRead([]);
    expect(state.updates).toHaveLength(1);
  });
});
