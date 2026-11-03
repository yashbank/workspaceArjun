/** R2-378/379: BOM list selects bomNumber, searches it, and maps legacy null. Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'ADMIN' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: vi.fn() }));

const orders: Row[] = [
  { id: 'o1', orderNumber: 'ORD-1', status: 'CONFIRMED', description: 'x', deliveryDate: null, customer: null, bom: { status: 'DRAFT', bomNumber: 'BOM-202610-00042', stages: [] } },
  { id: 'o2', orderNumber: 'ORD-2', status: 'CONFIRMED', description: 'y', deliveryDate: null, customer: null, bom: { status: 'DRAFT', bomNumber: null, stages: [] } },
];
const findMany = vi.fn(async (_a?: Row) => orders);
vi.mock('@/server/db', () => ({ db: { misOrder: { findMany: (a: Row) => findMany(a), count: async () => 0 } } }));

const { listBomOverviewPage } = await import('./bom');
beforeEach(() => findMany.mockClear());

describe('R2-378/379 bomNumber', () => {
  it('search ORs on bom.bomNumber and select includes it', async () => {
    await listBomOverviewPage({ q: 'BOM-2026' });
    const a = findMany.mock.calls[0]?.[0];
    expect(a?.where.OR).toContainEqual({ bom: { bomNumber: { contains: 'BOM-2026', mode: 'insensitive' } } });
    expect(a?.include.bom.select.bomNumber).toBe(true);
  });
  it('maps bomNumber, null for legacy', async () => {
    const out = await listBomOverviewPage();
    expect(out.rows.map((r) => r.bomNumber)).toEqual(['BOM-202610-00042', null]);
  });
});
