import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canEditLogNow, crewFirst, operatorOptions, validateQuantities } from '@/lib/mis/production-form';

// R3-PRD: B115 B116 B117 B119 B124 B126 B120 (pure parts) and B122 crew-first ordering.

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const fn = {
  logFindUnique: vi.fn(), logFindMany: vi.fn(), logUpdate: vi.fn(),
  orderFindUnique: vi.fn(), qcFindUnique: vi.fn(), qcUpdate: vi.fn(),
  phaseFindMany: vi.fn(), phaseCount: vi.fn(), phaseCreateMany: vi.fn(),
  processFindMany: vi.fn(), stageFindMany: vi.fn(), stageFindFirst: vi.fn(),
  employeeFindUnique: vi.fn(), machineFindUnique: vi.fn(), ruleFindFirst: vi.fn(),
};
let planCalls = 0;
const dbMock = {
  misProductionLog: { findUnique: fn.logFindUnique, findMany: fn.logFindMany, update: fn.logUpdate },
  misOrder: { findUnique: fn.orderFindUnique },
  misQcCheck: { findUnique: fn.qcFindUnique, update: fn.qcUpdate, findMany: async () => [] },
  misJobPhase: { findMany: fn.phaseFindMany, count: fn.phaseCount, createMany: fn.phaseCreateMany, findFirst: async () => null },
  misProcess: { findMany: fn.processFindMany },
  misBomStage: { findMany: fn.stageFindMany, findFirst: fn.stageFindFirst },
  misEmployee: { findUnique: fn.employeeFindUnique },
  misMachine: { findUnique: fn.machineFindUnique },
  misBusinessRule: { findFirst: async () => ({ value: 'Asia/Kolkata' }), findMany: async () => [] },
  // An advisory-lock stand-in: serialises concurrent plans like pg_advisory_xact_lock does.
  $executeRaw: async () => { planCalls += 1; return 0; },
  $transaction: async (cb: (tx: unknown) => unknown) => cb(dbMock),
};
vi.mock('@/server/db', () => ({ db: dbMock }));

const { setWasteReason, acknowledgeQcFailure, planPhases } = await import('./job-phases');
const { editProductionLog, getDayProductionSummary, getProductionSummary } = await import('./production');

beforeEach(() => {
  vi.clearAllMocks();
  planCalls = 0;
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('SUPERVISOR');
});

describe('B115 setWasteReason', () => {
  it('unknown id is a typed not-found', async () => {
    fn.logFindUnique.mockResolvedValue(null);
    await expect(setWasteReason('x', 'ink')).rejects.toMatchObject({ reason: 'PHASE_NOT_FOUND' });
  });
  it('refuses a SIGNED_OFF phase', async () => {
    fn.logFindUnique.mockResolvedValue({ id: 'l', wasteReason: null, jobPhase: { status: 'SIGNED_OFF' } });
    await expect(setWasteReason('l', 'ink')).rejects.toThrow('Reopen the phase to change a signed record.');
    expect(fn.logUpdate).not.toHaveBeenCalled();
  });
  it('audits before/after', async () => {
    const { logAuditEvent } = await import('@/server/mis/audit');
    fn.logFindUnique.mockResolvedValue({ id: 'l', wasteReason: 'old', jobPhase: { status: 'IN_PROGRESS' } });
    fn.logUpdate.mockResolvedValue({ id: 'l' });
    await setWasteReason('l', 'new');
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ before: { wasteReason: 'old' }, after: { wasteReason: 'new' } }));
  });
});

describe('B116 acknowledgeQcFailure', () => {
  const check = { id: 'c', orderId: 'o', bomStageId: null, result: 'FAIL', acknowledgedAt: null };
  const phaseOf = (userProfileId: string | null) => ({ id: 'p', inCharge: { userProfileId } });
  beforeEach(() => {
    fn.qcFindUnique.mockResolvedValue(check);
    fn.orderFindUnique.mockResolvedValue({ status: 'IN_PRODUCTION' });
    fn.qcUpdate.mockImplementation(async ({ data }: { data: object }) => ({ id: 'c', ...data }));
    fn.phaseFindMany.mockResolvedValue([phaseOf('someone-else')]);
  });

  it('a non-in-charge SUPERVISOR is refused', async () => {
    await expect(acknowledgeQcFailure('c', 'ok then')).rejects.toMatchObject({ reason: 'NOT_THE_IN_CHARGE' });
  });
  it('ADMIN without a note is refused, with a note is OK', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    await expect(acknowledgeQcFailure('c', '  ')).rejects.toMatchObject({ reason: 'REASON_REQUIRED' });
    await expect(acknowledgeQcFailure('c', 'customer informed')).resolves.toMatchObject({ acknowledgedById: 'u1' });
  });
  it('the phase in-charge is allowed without a note', async () => {
    fn.phaseFindMany.mockResolvedValue([phaseOf('u1')]);
    await expect(acknowledgeQcFailure('c')).resolves.toBeDefined();
  });
  it('is refused on a closed order', async () => {
    fn.phaseFindMany.mockResolvedValue([phaseOf('u1')]);
    fn.orderFindUnique.mockResolvedValue({ status: 'COMPLETED' });
    await expect(acknowledgeQcFailure('c')).rejects.toThrow(/closed/);
  });
});

describe('B117 planPhases', () => {
  const sel = [{ processId: 'p1', applies: true }, { processId: 'p2', applies: false }];
  beforeEach(() => {
    getMisRole.mockResolvedValue('ADMIN');
    fn.orderFindUnique.mockResolvedValue({ id: 'o', status: 'CONFIRMED' });
    fn.processFindMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    fn.stageFindMany.mockResolvedValue([]);
    fn.phaseCount.mockResolvedValue(0);
    fn.phaseCreateMany.mockResolvedValue({ count: 2 });
  });

  it('refuses when every process is applies:false', async () => {
    await expect(planPhases('o', [{ processId: 'p1', applies: false }])).rejects.toThrow(/at least one/);
  });
  it('refuses an unknown or inactive process', async () => {
    fn.processFindMany.mockResolvedValue([{ id: 'p1' }]);
    await expect(planPhases('o', sel)).rejects.toThrow(/process/);
  });
  it('refuses a stage outside the order BOM', async () => {
    fn.processFindMany.mockResolvedValue([{ id: 'p1' }]);
    await expect(planPhases('o', [{ processId: 'p1', applies: true, bomStageId: 's1' }])).rejects.toThrow(/BOM/);
  });
  it('refuses a duplicate (process, stage) pair', async () => {
    await expect(planPhases('o', [{ processId: 'p1', applies: true }, { processId: 'p1', applies: true }])).rejects.toThrow(/twice/);
  });
  it('refuses a closed order', async () => {
    fn.orderFindUnique.mockResolvedValue({ id: 'o', status: 'CANCELLED' });
    await expect(planPhases('o', sel)).rejects.toThrow(/cancelled/);
  });
  it('takes the advisory lock, and a second concurrent plan writes nothing', async () => {
    fn.phaseCount.mockResolvedValueOnce(0).mockResolvedValue(2);
    fn.phaseCreateMany.mockResolvedValue({ count: 2 });
    fn.phaseFindMany.mockResolvedValue([]);
    const results = await Promise.allSettled([planPhases('o', sel), planPhases('o', sel)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(fn.phaseCreateMany).toHaveBeenCalledTimes(1);
    expect(planCalls).toBe(2);
  });
});

describe('B126 editProductionLog', () => {
  const NOW = new Date('2026-10-13T12:00:00Z');
  const logAt = (msAgo: number, over: object = {}) => ({
    id: 'l', orderId: 'o', loggedAt: new Date(NOW.getTime() - msAgo), qtyProduced: 100, qtyWaste: 2, unit: 'KG', bomStageId: null,
    jobPhase: { status: 'IN_PROGRESS' }, order: { status: 'IN_PRODUCTION' }, ...over,
  });
  const H = 3_600_000;
  beforeEach(() => {
    fn.logUpdate.mockImplementation(async ({ data }: { data: object }) => ({ id: 'l', unit: 'KG', ...data }));
  });

  it('23h59m is OK and 24h01m is refused', async () => {
    fn.logFindUnique.mockResolvedValue(logAt(24 * H - 60_000));
    await expect(editProductionLog('l', { qtyProduced: 90 }, NOW)).resolves.toBeDefined();
    fn.logFindUnique.mockResolvedValue(logAt(24 * H + 60_000));
    await expect(editProductionLog('l', { qtyProduced: 90 }, NOW)).rejects.toThrow('This entry can no longer be edited (24 h / signed off / order closed).');
  });
  it('refuses a signed-off phase and a closed order', async () => {
    fn.logFindUnique.mockResolvedValue(logAt(H, { jobPhase: { status: 'SIGNED_OFF' } }));
    await expect(editProductionLog('l', { qtyProduced: 90 }, NOW)).rejects.toThrow(/no longer be edited/);
    fn.logFindUnique.mockResolvedValue(logAt(H, { order: { status: 'COMPLETED' } }));
    await expect(editProductionLog('l', { qtyProduced: 90 }, NOW)).rejects.toThrow(/no longer be edited/);
  });
  it('WORKER and QC are forbidden, SUPERVISOR allowed', async () => {
    fn.logFindUnique.mockResolvedValue(logAt(H));
    for (const role of ['WORKER', 'QC']) {
      getMisRole.mockResolvedValue(role);
      await expect(editProductionLog('l', { qtyProduced: 90 }, NOW)).rejects.toThrow(/Not permitted/);
    }
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(editProductionLog('l', { qtyProduced: 90 }, NOW)).resolves.toBeDefined();
  });
  it('validates like create: waste <= produced, finite, active operator, stage in BOM', async () => {
    fn.logFindUnique.mockResolvedValue(logAt(H));
    await expect(editProductionLog('l', { qtyProduced: 5, qtyWaste: 9 }, NOW)).rejects.toThrow(/Waste/);
    await expect(editProductionLog('l', { qtyProduced: Number.NaN }, NOW)).rejects.toThrow(/valid number/);
    fn.employeeFindUnique.mockResolvedValue({ isActive: false });
    await expect(editProductionLog('l', { employeeId: 'e' }, NOW)).rejects.toThrow('Operator not found.');
    fn.stageFindFirst.mockResolvedValue(null);
    await expect(editProductionLog('l', { bomStageId: 's' }, NOW)).rejects.toThrow(/BOM/);
  });
  it('writes the edit and audits quantities only', async () => {
    const { logAuditEvent } = await import('@/server/mis/audit');
    fn.logFindUnique.mockResolvedValue(logAt(H));
    await editProductionLog('l', { qtyProduced: 80, qtyWaste: 1 }, NOW);
    expect(fn.logUpdate.mock.calls[0][0].data).toMatchObject({ qtyProduced: 80, qtyWaste: 1 });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRODUCTION_LOG_EDIT', before: { qtyProduced: 100, qtyWaste: 2, unit: 'KG' }, after: { qtyProduced: 80, qtyWaste: 1, unit: 'KG' } }),
    );
  });
  it('the totals reflect the edit', async () => {
    fn.logFindMany.mockResolvedValue([{ qtyProduced: 80, qtyWaste: 1, unit: 'KG' }]);
    expect((await getProductionSummary('o')).byUnit).toEqual([{ unit: 'KG', produced: 80, waste: 1, wastePercent: (1 / 81) * 100 }]);
  });
  it('the client window helper agrees with the server', () => {
    expect(canEditLogNow({ loggedAt: new Date(NOW.getTime() - 24 * H + 1) }, 'IN_PRODUCTION', NOW)).toBe(true);
    expect(canEditLogNow({ loggedAt: new Date(NOW.getTime() - 24 * H - 1) }, 'IN_PRODUCTION', NOW)).toBe(false);
    expect(canEditLogNow({ loggedAt: NOW, phaseSigned: true }, 'IN_PRODUCTION', NOW)).toBe(false);
    expect(canEditLogNow({ loggedAt: NOW }, 'DELIVERED', NOW)).toBe(false);
  });
});

describe('B124 units', () => {
  it('500 PIECE + 200 KG are two totals, with waste % per unit', async () => {
    fn.logFindMany.mockResolvedValue([
      { qtyProduced: 500, qtyWaste: 50, unit: 'PIECE' },
      { qtyProduced: 200, qtyWaste: 0, unit: 'kg' },
    ]);
    const s = await getProductionSummary('o');
    expect(s.byUnit.map((u) => [u.unit, u.produced, u.waste])).toEqual([['KG', 200, 0], ['PIECE', 500, 50]]);
    expect(s.byUnit.find((u) => u.unit === 'PIECE')?.wastePercent).toBeCloseTo(9.09, 1);
    expect(s.byUnit.find((u) => u.unit === 'KG')?.wastePercent).toBe(0);
  });
});

describe('B119 day summary uses the factory day', () => {
  it('a log at 2026-10-13T19:00Z counts for Oct 14 IST, not Oct 13', async () => {
    fn.logFindMany.mockResolvedValue([{ qtyProduced: 10, qtyWaste: 1, machineId: 'm', loggedAt: new Date('2026-10-13T19:00:00Z') }]);
    const oct14 = await getDayProductionSummary(new Date('2026-10-14T06:00:00Z'));
    expect(oct14).toMatchObject({ produced: 10, entries: 1 });
    const oct13 = await getDayProductionSummary(new Date('2026-10-13T06:00:00Z'));
    expect(oct13.entries).toBe(0);
  });
});

describe('B122 crew-first ordering and B120 form checks', () => {
  const emps = [
    { id: 'a', name: 'Asha', employeeCode: 'E1', role: 'WORKER' },
    { id: 'b', name: 'Bala', employeeCode: 'E2', role: 'WORKER' },
    { id: 'c', name: 'Chitra', employeeCode: 'E3', role: 'SUPERVISOR' },
  ];
  it('lists the crew first, labelled On this machine', () => {
    const opts = operatorOptions(emps, ['c']);
    expect(opts.map((o) => o.value)).toEqual(['c', 'a', 'b']);
    expect(opts[0].label).toContain('On this machine');
    expect(opts[1].label).not.toContain('On this machine');
  });
  it('no crew leaves the order alone', () => {
    expect(crewFirst(operatorOptions(emps), []).map((o) => o.value)).toEqual(['a', 'b', 'c']);
  });
  it('validateQuantities', () => {
    expect(validateQuantities('', '')).not.toBeNull();
    expect(validateQuantities('0', '')).not.toBeNull();
    expect(validateQuantities('abc', '')).not.toBeNull();
    expect(validateQuantities('10', '-1')).not.toBeNull();
    expect(validateQuantities('10', '11')).not.toBeNull();
    expect(validateQuantities('10', '')).toBeNull();
    expect(validateQuantities('10', '10')).toBeNull();
  });
});
