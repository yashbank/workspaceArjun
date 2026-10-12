/**
 * C3 · D6 — QC only logs production quality checks: no PO, no GRN. Pinned at the server functions (the menu is
 * pinned in navigation.test.ts). Each call must be refused with MisForbiddenError before any query.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queried: string[] = [];
const spy = (name: string) => async () => { queried.push(name); return []; };
vi.mock('@/server/db', () => ({
  db: {
    misGrn: { findMany: spy('grn'), findUnique: spy('grn') },
    misPurchaseOrder: { findMany: spy('po'), findUnique: spy('po') },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { listGRNs, getGRN } = await import('./grn');
const { listPOs, getPO } = await import('./po');

beforeEach(() => {
  vi.clearAllMocks();
  queried.length = 0;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('QC');
});

describe.each([
  ['listGRNs', () => listGRNs()],
  ['getGRN', () => getGRN('00000000-0000-4000-8000-000000000000')],
  ['listPOs', () => listPOs()],
  ['getPO', () => getPO('00000000-0000-4000-8000-000000000000')],
])('%s', (_name, run) => {
  it('refuses QC with MisForbiddenError and runs no query', async () => {
    await expect(run()).rejects.toMatchObject({ name: 'MisForbiddenError' });
    expect(queried).toEqual([]);
  });
});
