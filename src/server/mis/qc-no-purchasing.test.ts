/**
 * C3 · D6 (revised by R2-37) — QC may VIEW purchase orders and GRNs read-only (po.view / grn.view) but can write
 * neither, and still cannot reach the purchasing legs that stay on po.read / grn.read (suppliers, 3-way match,
 * traceability). Pinned at the server functions (the menu is pinned in navigation.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queried: string[] = [];
const spy = (name: string) => async () => { queried.push(name); return []; };
vi.mock('@/server/db', () => ({
  db: {
    misGrn: { findMany: spy('grn'), findUnique: spy('grn'), count: async () => 0 },
    misPurchaseOrder: { findMany: spy('po'), findUnique: spy('po'), count: async () => 0 },
    misSupplier: { findMany: spy('supplier') },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { listGRNs, getGRN, listGRNsPage, updateGRNItem, confirmGRN } = await import('./grn');
const { listPOs, getPO, listPOsPage, createPO } = await import('./po');
const { listSuppliers } = await import('./supplier');
const { reconcilePO } = await import('./supplier-invoice');

beforeEach(() => {
  vi.clearAllMocks();
  queried.length = 0;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('QC');
});

const ID = '00000000-0000-4000-8000-000000000000';

describe.each([
  ['listGRNs', () => listGRNs()],
  ['getGRN', () => getGRN(ID)],
  ['listGRNsPage', () => listGRNsPage({})],
  ['listPOs', () => listPOs()],
  ['getPO', () => getPO(ID)],
  ['listPOsPage', () => listPOsPage({})],
])('%s (R2-37 view)', (_name, run) => {
  it('lets QC read', async () => {
    await expect(run()).resolves.not.toThrow();
    expect(queried.length).toBeGreaterThan(0);
  });
});

describe.each([
  ['createPO', () => createPO({ purpose: 'BUFFER_STOCK', supplierId: 's1' })],
  ['confirmGRN', () => confirmGRN(ID)],
  ['updateGRNItem', () => updateGRNItem(ID, {} as never)],
  ['listSuppliers', () => listSuppliers()],
  ['reconcilePO', () => reconcilePO(ID)],
])('%s', (_name, run) => {
  it('still refuses QC with MisForbiddenError and runs no query', async () => {
    await expect(run()).rejects.toMatchObject({ name: 'MisForbiddenError' });
    expect(queried).toEqual([]);
  });
});
