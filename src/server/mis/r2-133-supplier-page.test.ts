/** R2-133 — the paged supplier directory. Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const findMany = vi.fn(async (_args?: Row) => [{ id: 's1', name: 'Acme' }]);
const count = vi.fn(async (_args?: Row) => 1);
vi.mock('@/server/db', () => ({ db: { misSupplier: { findMany: (a: Row) => findMany(a), count: (a: Row) => count(a) } } }));

const { listSuppliersPage } = await import('./supplier');

beforeEach(() => {
  findMany.mockClear();
  count.mockClear();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ADMIN');
});

describe('listSuppliersPage', () => {
  it('pages 10 at a time, excludes deleted, and returns { rows, total }', async () => {
    const out = await listSuppliersPage({ page: '2' });
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 10, take: 10, where: { deletedAt: null } });
    expect(out).toEqual({ rows: [{ id: 's1', name: 'Acme' }], total: 1 });
  });

  it('searches by name or code', async () => {
    await listSuppliersPage({ q: 'acme' });
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(JSON.stringify(where)).toContain('"contains":"acme"');
    expect(count.mock.calls[0]?.[0]?.where).toEqual(where);
  });

  it('refuses a role without po.read', async () => {
    getMisRole.mockResolvedValue('WORKER');
    await expect(listSuppliersPage()).rejects.toThrow();
  });
});
