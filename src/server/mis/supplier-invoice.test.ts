/**
 * V2 Epic 1/6 — the 3-way match hands quantities to any `po.read` holder and rupees to the Owner only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const D = (n: number) => ({ toNumber: () => n });
const RATE = 731.19;
vi.mock('@/server/db', () => ({
  db: {
    misPoItem: { findMany: async () => [{ id: 'p1', description: 'Kraft', quantity: D(10), ratePerUnit: D(RATE) }] },
    misGrnItem: { findMany: async () => [{ poItemId: 'p1', receivedQty: D(4), damageQuantity: D(1), shortQuantity: D(0), grn: { status: 'CONFIRMED' } }] },
    misSupplierInvoice: { findMany: async () => [{ id: 'inv1', invoiceNo: 'INV-1', invoiceDate: null, invoiceAmount: D(3000), grn: { grnNumber: 'GRN-1' } }] },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { reconcilePO } = await import('./supplier-invoice');

beforeEach(() => { vi.clearAllMocks(); getCurrentUser.mockResolvedValue({ id: 'u1' }); });

describe('reconcilePO', () => {
  it('the OWNER gets quantities and formatted rupees', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const r = await reconcilePO('po1');
    expect(r.lines[0]).toMatchObject({ ordered: 10, received: 4, damaged: 1, outstanding: 6 });
    expect(r.money).toEqual({ poValue: '₹7,311.90', receivedValue: '₹2,924.76', invoiced: '₹3,000.00', variance: '₹75.24', varianceRaw: 75.24 });
  });
  it.each(['ADMIN', 'STORE_GUY'] as const)('%s gets the same quantities and no rupee anywhere', async (role) => {
    getMisRole.mockResolvedValue(role);
    const r = await reconcilePO('po1');
    expect(r.lines[0].received).toBe(4);
    expect('money' in r).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/731|3000|2924/);
  });
  it.each(['QC', 'SUPERVISOR'] as const)('%s is refused (po.read)', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(reconcilePO('po1')).rejects.toThrow(/Not permitted/);
  });
});
