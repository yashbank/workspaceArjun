/** R2-124/139/140/141: BOM list status filter, KPI counts and due date. Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'ADMIN' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: vi.fn() }));

const due = new Date('2026-11-05T00:00:00Z');
const orders: Row[] = [{ id: 'o1', orderNumber: 'ORD-1', status: 'CONFIRMED', description: 'Boxes', deliveryDate: due, customer: { name: 'Acme' }, bom: null }];
const findMany = vi.fn(async (_a?: Row) => orders);
const count = vi.fn(async (a?: Row) => (a?.where?.bom === null ? 3 : a?.where?.bom?.status === 'DRAFT' ? 8 : a?.where?.bom?.status === 'PENDING_APPROVAL' ? 4 : a?.where?.bom?.status === 'APPROVED' ? 33 : 48));
vi.mock('@/server/db', () => ({ db: { misOrder: { findMany: (a: Row) => findMany(a), count: (a: Row) => count(a) } } }));

const { listBomOverviewPage } = await import('./bom');

beforeEach(() => { findMany.mockClear(); count.mockClear(); });

describe('R2-124 BOM list filters', () => {
  it('status=NO_BOM filters orders with no BOM row', async () => {
    await listBomOverviewPage({ status: 'NO_BOM' });
    expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ bom: null });
  });
  it('status=PENDING_APPROVAL filters by BOM status', async () => {
    await listBomOverviewPage({ status: 'PENDING_APPROVAL' });
    expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ bom: { status: 'PENDING_APPROVAL' } });
  });
  it('an unknown status is ignored', async () => {
    await listBomOverviewPage({ status: 'bogus' });
    expect(findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('bom');
  });
  it('returns counts per status and the due date', async () => {
    const out = await listBomOverviewPage();
    expect(out.counts).toEqual({ ALL: 48, NO_BOM: 3, DRAFT: 8, PENDING_APPROVAL: 4, APPROVED: 33 });
    expect(out.rows[0]?.deliveryDate).toBe('2026-11-05');
  });
});
