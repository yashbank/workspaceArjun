/** R2-361: the issue screen is only offered orders that can still take stock (CONFIRMED / IN_PRODUCTION). */
import { describe, expect, it, vi } from 'vitest';

const orderFindMany = vi.fn(async () => [
  { id: 'o1', orderNumber: 'ORD-1', customer: { name: 'Acme' } },
]);
vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findMany: (...a: unknown[]) => orderFindMany(...(a as [])) },
    misDepartment: { findMany: async () => [] },
  },
}));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'STORE_GUY' }));

const { listIssueTargets } = await import('./store');

describe('R2-361 listIssueTargets', () => {
  it('asks the database for open orders only; closed, completed and cancelled ones never reach the picker', async () => {
    const out = await listIssueTargets();
    expect(out.orders).toEqual([{ id: 'o1', orderNumber: 'ORD-1', customerName: 'Acme' }]);
    const where = (orderFindMany.mock.calls[0] as unknown as [{ where: { status: { in: string[] } } }])[0].where;
    expect([...where.status.in].sort()).toEqual(['CONFIRMED', 'IN_PRODUCTION']);
    for (const closed of ['COMPLETED', 'DELIVERED', 'CANCELLED', 'DRAFT']) expect(where.status.in).not.toContain(closed);
  });
});
