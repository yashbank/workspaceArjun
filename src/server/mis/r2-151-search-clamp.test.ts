/** R2-151 query clamp, R2-146 status on results. Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('@/server/mis/flags', () => ({ isMisEnabled: () => true }));

const orderFind = vi.fn(async (_a?: unknown) => [{ id: 'o1', orderNumber: 'ORD-1', status: 'IN_PRODUCTION', description: null, customer: { name: 'Acme' } }]);
const empty = async () => [];
vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findMany: (a: unknown) => orderFind(a) },
    misMachine: { findMany: async () => [{ id: 'm1', code: 'M1', name: 'Cutter', isActive: false }] },
    misItem: { findMany: empty }, misPurchaseOrder: { findMany: empty }, misGrn: { findMany: empty }, misEmployee: { findMany: empty },
  },
}));

const { searchMisEntities, MAX_QUERY_LENGTH } = await import('./search');
beforeEach(() => orderFind.mockClear());

describe('searchMisEntities', () => {
  it('clamps the query to 100 characters before it reaches the database', async () => {
    await searchMisEntities('a'.repeat(500));
    const where = (orderFind.mock.calls[0]?.[0] as { where: { OR: { orderNumber: { contains: string } }[] } }).where;
    expect(MAX_QUERY_LENGTH).toBe(100);
    expect(where.OR[0]!.orderNumber.contains).toHaveLength(100);
  });
  it('results carry a status', async () => {
    const out = await searchMisEntities('ac');
    expect(out.find((r) => r.type === 'order')?.status).toBe('IN_PRODUCTION');
    expect(out.find((r) => r.type === 'machine')?.status).toBe('INACTIVE');
  });
});
