/**
 * C4 (#31, #32) — `updateOrderStatus` used to write any string with no transition check and no
 * close gate. These tests reproduce that: an unknown value, an illegal jump, and a completion
 * past unsigned phases / an unresolved QC failure all used to succeed silently.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const phaseFindMany = vi.fn();
const qcFindMany = vi.fn();
const auditFindMany = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a), update: (...a: unknown[]) => orderUpdate(...a) },
    misJobPhase: { findMany: (...a: unknown[]) => phaseFindMany(...a) },
    misQcCheck: { findMany: (...a: unknown[]) => qcFindMany(...a) },
    misAuditLog: { findMany: (...a: unknown[]) => auditFindMany(...a) },
  },
}));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const { updateOrderStatus, getOrderCloseGates, getOrderCloseOverride, isOrderStatusError } = await import('./orders');

const order = (status: string) => ({ id: 'o1', orderNumber: 'ORD-118', status });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ADMIN');
  phaseFindMany.mockResolvedValue([]);
  qcFindMany.mockResolvedValue([]);
  orderUpdate.mockImplementation(({ data }: { data: { status: string } }) => ({ id: 'o1', orderNumber: 'ORD-118', ...data }));
});

const refusal = async (p: Promise<unknown>) => {
  const error = await p.then(() => null, (e: unknown) => e);
  expect(isOrderStatusError(error)).toBe(true);
  return error as { reason: string; message: string; gates?: { key: string }[] };
};

describe('updateOrderStatus — transitions', () => {
  it('rejects an unknown status (the tester\'s "COMPLETE")', async () => {
    orderFindUnique.mockResolvedValue(order('IN_PRODUCTION'));
    expect((await refusal(updateOrderStatus('o1', 'COMPLETE'))).reason).toBe('UNKNOWN_STATUS');
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('rejects an illegal jump, naming both statuses', async () => {
    orderFindUnique.mockResolvedValue(order('DRAFT'));
    const err = await refusal(updateOrderStatus('o1', 'DELIVERED'));
    expect(err.reason).toBe('ILLEGAL_TRANSITION');
    expect(err.message).toMatch(/ORD-118.*draft.*delivered/);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it.each(['DELIVERED', 'CANCELLED'])('%s is terminal', async (from) => {
    orderFindUnique.mockResolvedValue(order(from));
    expect((await refusal(updateOrderStatus('o1', 'IN_PRODUCTION'))).reason).toBe('ILLEGAL_TRANSITION');
  });

  it('a legal move writes the status and audits before and after', async () => {
    orderFindUnique.mockResolvedValue(order('DRAFT'));
    await updateOrderStatus('o1', 'CONFIRMED');
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'CONFIRMED' } });
    expect(audit.mock.calls[0][0]).toMatchObject({ action: 'order.status_change', before: { status: 'DRAFT' }, after: { status: 'CONFIRMED' } });
  });

  it('is gated on orders.write', async () => {
    getMisRole.mockResolvedValue('WORKER');
    orderFindUnique.mockResolvedValue(order('DRAFT'));
    await expect(updateOrderStatus('o1', 'CONFIRMED')).rejects.toThrow(/Not permitted/);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('cancelling needs a reason, which is audited', async () => {
    orderFindUnique.mockResolvedValue(order('CONFIRMED'));
    expect((await refusal(updateOrderStatus('o1', 'CANCELLED', { reason: ' x ' }))).reason).toBe('REASON_REQUIRED');
    await updateOrderStatus('o1', 'CANCELLED', { reason: 'customer withdrew' });
    expect(audit.mock.calls[0][0].after).toMatchObject({ status: 'CANCELLED', reason: 'customer withdrew' });
  });
});

describe('updateOrderStatus — close gates for COMPLETED', () => {
  beforeEach(() => orderFindUnique.mockResolvedValue(order('IN_PRODUCTION')));

  it('an order with no phase plan and no QC completes with no reason', async () => {
    await updateOrderStatus('o1', 'COMPLETED');
    expect(orderUpdate).toHaveBeenCalled();
    expect(audit.mock.calls[0][0].after).not.toHaveProperty('gatesOverridden');
  });

  it('all gates met: no reason needed', async () => {
    getMisRole.mockResolvedValue('OWNER');
    phaseFindMany.mockResolvedValue([{ status: 'SIGNED_OFF' }, { status: 'NOT_APPLICABLE' }]);
    await expect(updateOrderStatus('o1', 'COMPLETED')).resolves.toBeDefined();
  });

  it('unsigned phase + no reason is refused, listing the unmet gate', async () => {
    phaseFindMany.mockResolvedValue([{ status: 'SIGNED_OFF' }, { status: 'IN_PROGRESS' }]);
    const err = await refusal(updateOrderStatus('o1', 'COMPLETED'));
    expect(err.reason).toBe('GATES_UNMET');
    expect(err.gates?.map((g) => g.key)).toEqual(['PHASES_SIGNED_OFF']);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('an unresolved QC failure blocks completion', async () => {
    qcFindMany.mockResolvedValue([{ bomStageId: null, parameterName: 'Shade', result: 'FAIL', checkTime: new Date() }]);
    expect((await refusal(updateOrderStatus('o1', 'COMPLETED'))).gates?.map((g) => g.key)).toEqual(['QC_RESOLVED']);
  });

  it('a reason under 3 characters does not count', async () => {
    phaseFindMany.mockResolvedValue([{ status: 'PENDING' }]);
    expect((await refusal(updateOrderStatus('o1', 'COMPLETED', { reason: 'ok' }))).reason).toBe('GATES_UNMET');
  });

  it.each(['OWNER', 'ADMIN'])('%s may override with a reason, which lands in the audit row', async (role) => {
    getMisRole.mockResolvedValue(role);
    phaseFindMany.mockResolvedValue([{ status: 'PENDING' }]);
    await updateOrderStatus('o1', 'COMPLETED', { reason: 'customer collected early' });
    expect(audit.mock.calls[0][0].after).toMatchObject({
      status: 'COMPLETED',
      reason: 'customer collected early',
      gatesOverridden: [{ key: 'PHASES_SIGNED_OFF' }],
    });
  });

  it.each(['SUPERVISOR', 'QC'])('%s cannot override, even with a reason', async (role) => {
    getMisRole.mockResolvedValue(role);
    phaseFindMany.mockResolvedValue([{ status: 'PENDING' }]);
    const err = await refusal(updateOrderStatus('o1', 'COMPLETED', { reason: 'please' })).catch(() => null);
    // A role without orders.write is refused earlier by the permission gate; either way nothing is written.
    expect(orderUpdate).not.toHaveBeenCalled();
    if (err) expect(['OVERRIDE_NOT_ALLOWED']).toContain(err.reason);
  });
});

describe('close gate reads', () => {
  it('getOrderCloseGates reports each gate', async () => {
    phaseFindMany.mockResolvedValue([{ status: 'PENDING' }]);
    const gates = await getOrderCloseGates('o1');
    expect(gates.map((g) => [g.key, g.passed])).toEqual([['PHASES_SIGNED_OFF', false], ['QC_RESOLVED', true]]);
  });

  it('getOrderCloseOverride finds the latest completion that overrode gates', async () => {
    const at = new Date();
    auditFindMany.mockResolvedValue([
      { after: { status: 'DELIVERED' }, createdAt: at },
      { after: { status: 'COMPLETED', reason: 'collected early', gatesOverridden: [{ key: 'PHASES_SIGNED_OFF' }] }, createdAt: at },
    ]);
    expect(await getOrderCloseOverride('o1')).toEqual({ reason: 'collected early', at });
    auditFindMany.mockResolvedValue([{ after: { status: 'COMPLETED' }, createdAt: at }]);
    expect(await getOrderCloseOverride('o1')).toBeNull();
  });
});
