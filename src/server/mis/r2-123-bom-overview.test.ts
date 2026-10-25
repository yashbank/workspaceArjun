/** R2-122/123/137/143 — the paged BOM overview: pagination, BOM-status badge data, and cost gated to wages.read. Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: vi.fn() }));

const orders: Row[] = [
  {
    id: 'o1', orderNumber: 'ORD-1', status: 'IN_PRODUCTION', description: 'Boxes', customer: { name: 'Acme' },
    bom: { status: 'APPROVED', stages: [{ id: 's1', materials: [{ id: 'm1', quantity: 10, ratePerUnit: 5 }] }] },
  },
  { id: 'o2', orderNumber: 'ORD-2', status: 'CONFIRMED', description: null, customer: null, bom: null },
];
const findMany = vi.fn(async (_args?: Row) => orders);
const count = vi.fn(async (_args?: Row) => orders.length);
vi.mock('@/server/db', () => ({ db: { misOrder: { findMany: (a: Row) => findMany(a), count: (a: Row) => count(a) } } }));

const { listBomOverviewPage } = await import('./bom');

beforeEach(() => {
  findMany.mockClear();
  count.mockClear();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('listBomOverviewPage', () => {
  it('pages 10 at a time and excludes CANCELLED/DELIVERED orders', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    await listBomOverviewPage({ page: '2' });
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 10, take: 10, where: { status: { notIn: ['CANCELLED', 'DELIVERED'] } } });
  });

  it('badges NO_BOM for an order with no BOM row, and the real status otherwise', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    const out = await listBomOverviewPage();
    expect(out.rows.find((r) => r.orderId === 'o1')?.bomStatus).toBe('APPROVED');
    expect(out.rows.find((r) => r.orderId === 'o2')?.bomStatus).toBe('NO_BOM');
  });

  it('counts stages and materials', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    const out = await listBomOverviewPage();
    const row = out.rows.find((r) => r.orderId === 'o1')!;
    expect(row.stageCount).toBe(1);
    expect(row.materialCount).toBe(1);
  });

  it('OWNER sees the rolled-up cost; a role without wages.read does not', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const owner = await listBomOverviewPage();
    expect(owner.rows.find((r) => r.orderId === 'o1')?.estimatedCostLabel).not.toBeNull();

    getMisRole.mockResolvedValue('SUPERVISOR');
    const supervisor = await listBomOverviewPage();
    expect(supervisor.rows.find((r) => r.orderId === 'o1')?.estimatedCostLabel).toBeNull();
  });

  it('refuses a role without orders.read', async () => {
    getMisRole.mockResolvedValue('WORKER');
    await expect(listBomOverviewPage()).rejects.toThrow();
  });
});
