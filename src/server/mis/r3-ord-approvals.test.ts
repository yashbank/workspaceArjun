/** R3-ORD B110: one failing query no longer reads as an empty inbox. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'ADMIN' }));
const leaves = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misBom: { findMany: async () => [{ id: 'b1', order: { id: 'o1', orderNumber: 'ORD-1', description: null } }] },
    misLeaveRequest: { findMany: (...a: unknown[]) => leaves(...a) },
    misPurchaseOrder: { findMany: async () => [{ id: 'p1', supplier: { name: 'Acme' } }] },
  },
}));

const { getPendingApprovals } = await import('./approvals');

beforeEach(() => vi.clearAllMocks());

describe('getPendingApprovals', () => {
  it('a failing query is reported and the other two still load', async () => {
    leaves.mockRejectedValue(new Error('db'));
    const out = await getPendingApprovals();
    expect(out.errors).toEqual(['Could not load leave approvals']);
    expect(out.boms).toHaveLength(1);
    expect(out.pos).toHaveLength(1);
    expect(out.leaves).toEqual([]);
  });
  it('no failure, no errors', async () => {
    leaves.mockResolvedValue([]);
    expect((await getPendingApprovals()).errors).toEqual([]);
  });
});
