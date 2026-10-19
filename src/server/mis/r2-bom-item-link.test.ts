/** R2-10 — a BOM material links to (or unlinks from) a catalog item on add and on edit. Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: vi.fn() }));

const items: Row[] = [
  { id: 'item-ok', isActive: true, deletedAt: null },
  { id: 'item-off', isActive: false, deletedAt: null },
  { id: 'item-gone', isActive: true, deletedAt: new Date() },
];
const material: Row = { id: 'mat-1', stageId: 's1', description: 'Board', itemId: null, quantity: 5, unit: 'KG', ratePerUnit: null, seq: 0, stage: { bom: { status: 'DRAFT' } } };
const update = vi.fn(async ({ data }: Row) => ({ ...material, ...data }));
vi.mock('@/server/db', () => ({
  db: {
    misItem: { findUnique: async ({ where }: Row) => items.find((i) => i.id === where.id) ?? null },
    misBomMaterial: { findUnique: async () => material, update: (...a: [Row]) => update(...a) },
  },
}));

const { updateBomMaterial } = await import('./bom');

beforeEach(() => {
  update.mockClear();
  audit.mockClear();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ADMIN');
});

describe('R2-10 updateBomMaterial itemId', () => {
  it('links an active item and audits the change', async () => {
    const rec = await updateBomMaterial('mat-1', { itemId: 'item-ok' });
    expect(update.mock.calls[0][0].data).toMatchObject({ itemId: 'item-ok' });
    expect(rec.itemId).toBe('item-ok');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE_BOM_MATERIAL' }));
  });
  it('null unlinks', async () => {
    await updateBomMaterial('mat-1', { itemId: null });
    expect(update.mock.calls[0][0].data).toMatchObject({ itemId: null });
  });
  it('leaving itemId out leaves the link alone', async () => {
    await updateBomMaterial('mat-1', { quantity: 7 });
    expect(update.mock.calls[0][0].data).not.toHaveProperty('itemId');
  });
  it.each(['item-off', 'item-gone', 'nope'])('refuses %s (inactive, deleted or unknown)', async (itemId) => {
    await expect(updateBomMaterial('mat-1', { itemId })).rejects.toThrow('That item does not exist or is inactive.');
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['SUPERVISOR', 'QC', 'STORE_GUY', 'WORKER'])('%s is forbidden (orders.write)', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(updateBomMaterial('mat-1', { itemId: 'item-ok' })).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});
