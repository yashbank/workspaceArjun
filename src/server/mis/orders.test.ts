import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
vi.mock('@/server/db', () => ({
  db: { misOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a), update: (...a: unknown[]) => orderUpdate(...a) } },
}));

const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const { reopenOrder } = await import('./orders');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ADMIN');
  orderUpdate.mockImplementation(({ data }: { data: { status: string } }) => ({ id: 'o1', orderNumber: 'ORD-118', ...data }));
});

describe('reopenOrder — the route through D14’s refusal', () => {
  it('puts a delivered order back in production and audits before, after and the reason', async () => {
    orderFindUnique.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-118', status: 'DELIVERED' });

    const after = await reopenOrder('o1', ' a late correction turned out to be genuine ');

    expect(after.status).toBe('IN_PRODUCTION');
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({
      action: 'order.reopen',
      before: { status: 'DELIVERED' },
      after: { status: 'IN_PRODUCTION', reason: 'a late correction turned out to be genuine' },
    });
  });

  it.each(['CANCELLED', 'DELIVERED', 'COMPLETED'])('reopens a %s order', async (status) => {
    orderFindUnique.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-118', status });
    await expect(reopenOrder('o1', 'reason')).resolves.toBeDefined();
  });

  it('needs a reason — a reopen with no reason is what an edit-the-database workaround looks like', async () => {
    await expect(reopenOrder('o1', '   ')).rejects.toThrow(/needs a reason/);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('refuses an order that is not closed, saying so', async () => {
    orderFindUnique.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-118', status: 'IN_PRODUCTION' });
    await expect(reopenOrder('o1', 'reason')).rejects.toThrow(/ORD-118.*nothing to reopen/);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('refuses an unknown order', async () => {
    orderFindUnique.mockResolvedValue(null);
    await expect(reopenOrder('nope', 'reason')).rejects.toThrow(/not found/);
  });

  it('needs orders.write — a QC operator cannot reopen an order', async () => {
    getMisRole.mockResolvedValue('QC');
    await expect(reopenOrder('o1', 'reason')).rejects.toThrow(/Not permitted: orders\.write/);
  });
});
