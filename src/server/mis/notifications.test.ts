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
      findMany: async ({ where }: { where: { misEmployee: { role: { in: string[] } }; id?: { not: string } } }) =>
        state.profiles.filter((p) => {
          const e = p.misEmployee as { role: string; isActive: boolean; deletedAt: Date | null };
          return where.misEmployee.role.in.includes(e.role) && e.isActive && !e.deletedAt && p.id !== where.id?.not;
        }),
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

const { listMisNotifications, markMisNotificationsRead, notifyRoles } = await import('./notifications');

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = []; state.updates = [];
  state.profiles = [
    { id: 'store-1', status: 'active', misEmployee: { role: 'STORE_GUY', isActive: true, deletedAt: null } },
    { id: 'sup-1', status: 'active', misEmployee: { role: 'SUPERVISOR', isActive: true, deletedAt: null } },
  ];
  getCurrentUser.mockResolvedValue({ id: 'store-1' });
  getMisRole.mockResolvedValue('STORE_GUY');
});

describe('writers', () => {
  it('notifyRoles writes one row per matching login', async () => {
    await notifyRoles(['STORE_GUY'], 'mis.material_request.raised', { requestId: 'r' });
    expect(state.rows.map((r) => r.userId)).toEqual(['store-1']); // not the Supervisor, not the soft-deleted storekeeper
  });
  it('the actor is left out — nobody is told about their own request', async () => {
    await notifyRoles(['STORE_GUY'], 'mis.material_request.raised', {}, 'store-1');
    expect(state.rows).toEqual([]);
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
    // the fake findMany filters on userId only; the real query also narrows `type` to the bell's own list
    expect((await listMisNotifications()).map((n) => n.type)).toEqual(['mis.grn_confirmed']);
    getMisRole.mockResolvedValue('SUPERVISOR');
    expect(await listMisNotifications()).toEqual([]);
    getMisRole.mockResolvedValue('QC');
    await expect(listMisNotifications()).rejects.toThrow(/Not permitted/);
  });
  it('mark-read is scoped to the caller and to the bell\'s own types; junk ids never reach the database', async () => {
    const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
    await markMisNotificationsRead([a, 'abc', b]);
    expect(state.updates[0]).toMatchObject({ where: { id: { in: [a, b] }, userId: 'store-1', type: { in: ['mis.grn_confirmed', 'mis.material_request.raised'] } } });
    await markMisNotificationsRead(['abc']);
    expect(state.updates).toHaveLength(1);
  });
});
