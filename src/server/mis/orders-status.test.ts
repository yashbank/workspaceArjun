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
const orderUpdateMany = vi.fn();
const phaseFindMany = vi.fn();
const qcFindMany = vi.fn();
const auditFindMany = vi.fn();
// R3-ORD fixtures: B104 runs the status write in a transaction (same client here) and reads the
// order's bookings / reservations / BOM / requests; B105 counts production logs.
const productionCount = vi.fn();
const productionFindMany = vi.fn(async () => [] as { qtyProduced: number; unit: string }[]);
const bomFindUnique = vi.fn(async () => null as { status: string } | null);
const txDb: Record<string, unknown> = {};
vi.mock('@/server/db', () => ({
  db: Object.assign(txDb, {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(txDb),
    misProductionLog: { count: (...a: unknown[]) => productionCount(...a), findMany: () => productionFindMany() },
    misMachineAllocation: { findMany: async () => [] },
    misOrderStockAllocation: { deleteMany: async () => ({ count: 0 }), count: async () => 0 },
    misBom: { findUnique: () => bomFindUnique(), updateMany: async () => ({ count: 0 }) },
    misMaterialRequest: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    misOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a), update: (...a: unknown[]) => orderUpdate(...a), updateMany: (...a: unknown[]) => orderUpdateMany(...a) },
    misJobPhase: { findMany: (...a: unknown[]) => phaseFindMany(...a) },
    misQcCheck: { findMany: (...a: unknown[]) => qcFindMany(...a) },
    misAuditLog: { findMany: (...a: unknown[]) => auditFindMany(...a) },
  }),
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
  productionCount.mockResolvedValue(1);
  orderUpdateMany.mockResolvedValue({ count: 1 });
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
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects an illegal jump, naming both statuses', async () => {
    orderFindUnique.mockResolvedValue(order('DRAFT'));
    const err = await refusal(updateOrderStatus('o1', 'DELIVERED'));
    expect(err.reason).toBe('ILLEGAL_TRANSITION');
    expect(err.message).toMatch(/ORD-118.*draft.*delivered/);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it.each(['DELIVERED', 'CANCELLED'])('%s is terminal', async (from) => {
    orderFindUnique.mockResolvedValue(order(from));
    expect((await refusal(updateOrderStatus('o1', 'IN_PRODUCTION'))).reason).toBe('ILLEGAL_TRANSITION');
  });

  it('a legal move writes the status and audits before and after', async () => {
    orderFindUnique.mockResolvedValue(order('DRAFT'));
    await updateOrderStatus('o1', 'CONFIRMED');
    expect(orderUpdateMany).toHaveBeenCalledWith({ where: { id: 'o1', status: 'DRAFT' }, data: { status: 'CONFIRMED' } });
    expect(audit.mock.calls[0][0]).toMatchObject({ action: 'order.status_change', before: { status: 'DRAFT' }, after: { status: 'CONFIRMED' } });
  });

  it('is gated on orders.write', async () => {
    getMisRole.mockResolvedValue('WORKER');
    orderFindUnique.mockResolvedValue(order('DRAFT'));
    await expect(updateOrderStatus('o1', 'CONFIRMED')).rejects.toThrow(/Not permitted/);
    expect(orderUpdateMany).not.toHaveBeenCalled();
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
    expect(orderUpdateMany).toHaveBeenCalled();
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
    expect(orderUpdateMany).not.toHaveBeenCalled();
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
    expect(orderUpdateMany).not.toHaveBeenCalled();
    if (err) expect(['OVERRIDE_NOT_ALLOWED']).toContain(err.reason);
  });
});

describe('updateOrderStatus — stale status and reopen-by-status', () => {
  it('refuses when the status changed under us (compare-and-set matched nothing) and audits nothing', async () => {
    orderFindUnique.mockResolvedValue(order('DRAFT'));
    orderUpdateMany.mockResolvedValue({ count: 0 });
    expect((await refusal(updateOrderStatus('o1', 'CONFIRMED'))).reason).toBe('STALE_STATUS');
    expect(audit).not.toHaveBeenCalled();
  });

  // R2-267: starting production needs an APPROVED BOM; only the Owner may start anyway, with a reason on the record.
  describe('R2-267 CONFIRMED -> IN_PRODUCTION and the BOM', () => {
    beforeEach(() => orderFindUnique.mockResolvedValue(order('CONFIRMED')));

    it('an Admin is refused with no BOM, and with a DRAFT one', async () => {
      bomFindUnique.mockResolvedValue(null);
      const none = await refusal(updateOrderStatus('o1', 'IN_PRODUCTION'));
      expect(none.reason).toBe('BOM_NOT_APPROVED');
      expect(none.message).toMatch(/no BOM/);
      bomFindUnique.mockResolvedValue({ status: 'DRAFT' });
      expect((await refusal(updateOrderStatus('o1', 'IN_PRODUCTION', { reason: 'urgent' }))).message).toMatch(/BOM is draft/);
      expect(orderUpdateMany).not.toHaveBeenCalled();
    });

    it('the Owner needs a reason, and the reason is audited as a start without an approved BOM', async () => {
      getMisRole.mockResolvedValue('OWNER');
      bomFindUnique.mockResolvedValue({ status: 'PENDING_APPROVAL' });
      expect((await refusal(updateOrderStatus('o1', 'IN_PRODUCTION'))).reason).toBe('BOM_NOT_APPROVED');
      await updateOrderStatus('o1', 'IN_PRODUCTION', { reason: 'customer sample run, BOM follows' });
      expect(audit.mock.calls[0][0].after).toMatchObject({ status: 'IN_PRODUCTION', reason: 'customer sample run, BOM follows', startedWithoutApprovedBom: 'BOM is pending approval' });
    });

    it('an APPROVED BOM lets anyone with orders.write start, no reason needed', async () => {
      bomFindUnique.mockResolvedValue({ status: 'APPROVED' });
      await expect(updateOrderStatus('o1', 'IN_PRODUCTION')).resolves.toMatchObject({ status: 'IN_PRODUCTION' });
    });
  });

  // R2-264: an order with a target quantity completes only when production in that unit has reached it.
  describe('R2-264 ordered quantity gate', () => {
    it('is absent for an order without a quantity, fails short of it, passes at or above it (same unit only)', async () => {
      orderFindUnique.mockResolvedValue(order('IN_PRODUCTION'));
      expect((await getOrderCloseGates('o1')).map((g) => g.key)).not.toContain('QUANTITY_MET');
      orderFindUnique.mockResolvedValue({ ...order('IN_PRODUCTION'), quantity: 100, unit: 'KG' });
      productionFindMany.mockResolvedValue([{ qtyProduced: 60, unit: 'kg' }, { qtyProduced: 500, unit: 'PIECE' }]);
      const short = (await getOrderCloseGates('o1')).find((g) => g.key === 'QUANTITY_MET')!;
      expect(short).toMatchObject({ passed: false, detail: 'Produced 60 of 100 KG' });
      productionFindMany.mockResolvedValue([{ qtyProduced: 60, unit: 'KG' }, { qtyProduced: 45, unit: 'kg' }]);
      expect((await getOrderCloseGates('o1')).find((g) => g.key === 'QUANTITY_MET')!.passed).toBe(true);
    });
  });

  it('COMPLETED -> IN_PRODUCTION needs a reason, which is audited', async () => {
    orderFindUnique.mockResolvedValue(order('COMPLETED'));
    expect((await refusal(updateOrderStatus('o1', 'IN_PRODUCTION'))).reason).toBe('REASON_REQUIRED');
    await updateOrderStatus('o1', 'IN_PRODUCTION', { reason: 'rework found' });
    expect(audit.mock.calls[0][0]).toMatchObject({ before: { status: 'COMPLETED' }, after: { status: 'IN_PRODUCTION', reason: 'rework found' } });
  });

  it('a legacy "COMPLETE" row is not stuck: it can be delivered', async () => {
    orderFindUnique.mockResolvedValue(order('COMPLETE'));
    await expect(updateOrderStatus('o1', 'DELIVERED')).resolves.toBeDefined();
  });
});

describe('close gate reads', () => {
  it('getOrderCloseGates reports each gate', async () => {
    phaseFindMany.mockResolvedValue([{ status: 'PENDING' }]);
    const gates = await getOrderCloseGates('o1');
    // R3 B105: the production-logged gate is now the third entry (one log is mocked, so it is met).
    expect(gates.map((g) => [g.key, g.passed])).toEqual([['PHASES_SIGNED_OFF', false], ['QC_RESOLVED', true], ['PRODUCTION_LOGGED', true]]);
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

describe('R2-327 a zero-quantity entry does not satisfy the production gate', () => {
  it('counts only logs with qtyProduced > 0', async () => {
    orderFindUnique.mockResolvedValue({ quantity: null, unit: null });
    await getOrderCloseGates('o1');
    expect(productionCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ qtyProduced: { gt: 0 } }) }));
  });
  it('reads as unmet when every log is a 0-quantity placeholder', async () => {
    orderFindUnique.mockResolvedValue({ quantity: null, unit: null });
    productionCount.mockResolvedValue(0);
    const gates = await getOrderCloseGates('o1');
    expect(gates.find((g) => g.key === 'PRODUCTION_LOGGED')).toMatchObject({ passed: false, detail: 'No production has been logged' });
  });
});
