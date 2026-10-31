import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const mockMachineFindUnique = vi.fn();
const mockClearanceFindFirst = vi.fn();
const mockClearanceFindMany = vi.fn();
const mockClearanceCreate = vi.fn();
const mockAllocationFindFirst = vi.fn();
const mockAllocationFindMany = vi.fn();
const mockShiftFindUnique = vi.fn();
const mockShiftFindMany = vi.fn();
const mockRuleFindFirst = vi.fn();
const mockRuleCreate = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    misMachine: { findUnique: (...a: unknown[]) => mockMachineFindUnique(...a) },
    misLineClearance: {
      findFirst: (...a: unknown[]) => mockClearanceFindFirst(...a),
      findMany: (...a: unknown[]) => mockClearanceFindMany(...a),
      create: (...a: unknown[]) => mockClearanceCreate(...a),
    },
    misMachineAllocation: {
      findFirst: (...a: unknown[]) => mockAllocationFindFirst(...a),
      findMany: (...a: unknown[]) => mockAllocationFindMany(...a),
    },
    misShift: {
      findUnique: (...a: unknown[]) => mockShiftFindUnique(...a),
      findMany: (...a: unknown[]) => mockShiftFindMany(...a),
    },
    misBusinessRule: {
      findFirst: (...a: unknown[]) => mockRuleFindFirst(...a),
      create: (...a: unknown[]) => mockRuleCreate(...a),
    },
  },
}));

const mockAudit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

const { assertLineCleared, getClearanceStatus, clearLine, LineClearanceBlockedError } =
  await import('./line-clearance');

const ALL_ROLES = [
  'OWNER',
  'ADMIN',
  'SUPERVISOR',
  'QC',
  'ATTENDANCE_OPERATOR',
  'SUPER_ATTENDANCE_OPERATOR',
  'WORKER',
  'STORE_GUY',
] as const;
const CANNOT_CLEAR_ROLES = ALL_ROLES.filter((r) => !['OWNER', 'ADMIN', 'SUPERVISOR'].includes(r));

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  mockMachineFindUnique.mockResolvedValue({ name: 'Polar 115 Cutter' });
  mockShiftFindMany.mockResolvedValue([]);
  // No business-rule rows on record — clearLine seeds the D7 defaults (JOB / 120 min cap).
  mockRuleFindFirst.mockResolvedValue(null);
  mockRuleCreate.mockResolvedValue({});
});

describe('clearLine — SUPERVISOR and above only (D7)', () => {
  it.each(CANNOT_CLEAR_ROLES)('throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(clearLine({ machineId: 'm1' })).rejects.toThrow(/Not permitted: clearance\.write/);
  });

  it('SUPERVISOR may clear the line', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    mockAllocationFindFirst.mockResolvedValue(null);
    mockClearanceCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', ...data }));

    const rec = await clearLine({ machineId: 'm1', orderId: 'o1' });

    expect(rec.mode).toBe('JOB');
    expect(mockClearanceCreate).toHaveBeenCalledTimes(1);
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });

  it('is append-only: never updates a past clearance row', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    mockAllocationFindFirst.mockResolvedValue(null);
    mockClearanceCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', ...data }));

    await clearLine({ machineId: 'm1', orderId: 'o1' });

    const [{ data }] = mockClearanceCreate.mock.calls[0];
    expect(data.machineId).toBe('m1');
    expect(data.orderId).toBe('o1');
  });
});

describe('assertLineCleared — the production.ts precondition', () => {
  it('throws NOT_CLEARED when no clearance row exists', async () => {
    mockClearanceFindFirst.mockResolvedValue(null);
    await expect(assertLineCleared('m1')).rejects.toThrow(LineClearanceBlockedError);
    await expect(assertLineCleared('m1')).rejects.toThrow(/needs a line clearance/);
  });

  it('names the machine in the error', async () => {
    mockMachineFindUnique.mockResolvedValue({ name: 'Polar 115 Cutter' });
    mockClearanceFindFirst.mockResolvedValue(null);
    await expect(assertLineCleared('m1')).rejects.toThrow(/Polar 115 Cutter/);
  });

  it('throws EXPIRED when the cap has passed', async () => {
    mockClearanceFindFirst.mockResolvedValue({
      mode: 'JOB',
      orderId: 'o1',
      shiftId: null,
      clearedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await expect(assertLineCleared('m1')).rejects.toThrow(/expired/i);
  });

  it('words the expiry time in the factory zone, 12-hour, never as an ISO string', async () => {
    mockClearanceFindFirst.mockResolvedValue({
      mode: 'JOB',
      orderId: 'o1',
      shiftId: null,
      clearedAt: new Date('2026-09-20T01:00:00.000Z'),
      expiresAt: new Date('2026-09-20T12:34:00.000Z'),
    });
    const err = await assertLineCleared('m1').catch((e: Error) => e);
    expect((err as Error).message).toContain('20/09/2026 6:04 pm'); // 12:34 UTC = 18:04 IST
    expect((err as Error).message).not.toMatch(/T\d\d:\d\d|Z\b/);
  });

  it('passes when cleared, uncapped, and the machine has no active allocation', async () => {
    mockClearanceFindFirst.mockResolvedValue({
      mode: 'JOB',
      orderId: 'o1',
      shiftId: null,
      clearedAt: new Date(),
      expiresAt: null,
    });
    mockAllocationFindFirst.mockResolvedValue(null);
    await expect(assertLineCleared('m1')).resolves.toBeUndefined();
  });

  describe('JOB mode — expires when the machine current order changes', () => {
    it('stays valid while the active allocation is still the cleared order', async () => {
      mockClearanceFindFirst.mockResolvedValue({
        mode: 'JOB',
        orderId: 'o1',
        shiftId: null,
        clearedAt: new Date(),
        expiresAt: null,
      });
      mockAllocationFindFirst.mockResolvedValue({ orderId: 'o1' });
      await expect(assertLineCleared('m1')).resolves.toBeUndefined();
    });

    it('expires once the active allocation moves to a different order', async () => {
      mockClearanceFindFirst.mockResolvedValue({
        mode: 'JOB',
        orderId: 'o1',
        shiftId: null,
        clearedAt: new Date(),
        expiresAt: null,
      });
      mockAllocationFindFirst.mockResolvedValue({ orderId: 'o2' });
      await expect(assertLineCleared('m1')).rejects.toThrow(/expired/i);
    });
  });

  describe('SHIFT mode — expires at shift end', () => {
    it('expires once a full shift cycle has elapsed since clearing', async () => {
      mockClearanceFindFirst.mockResolvedValue({
        mode: 'SHIFT',
        orderId: null,
        shiftId: 's1',
        clearedAt: new Date(Date.now() - 20 * 60 * 60 * 1000), // 20h ago
        expiresAt: null,
      });
      mockShiftFindUnique.mockResolvedValue({ startTime: '06:00', endTime: '15:00' }); // 9h shift
      await expect(assertLineCleared('m1')).rejects.toThrow(/expired/i);
    });
  });

  describe('MINUTES mode — the fixed-duration cap is the only clock', () => {
    it('is blocked once expiresAt has passed', async () => {
      mockClearanceFindFirst.mockResolvedValue({
        mode: 'MINUTES',
        orderId: null,
        shiftId: null,
        clearedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      const status = await getClearanceStatus('m1');
      expect(status.cleared).toBe(false);
    });
  });
});

describe('R2-308 a SHIFT clearance made outside any shift lasts 8 hours, never for ever', () => {
  const noShift = (hoursAgo: number) => ({ mode: 'SHIFT', orderId: null, shiftId: null, clearedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000), expiresAt: null });
  it('is still valid after 7 hours', async () => {
    mockClearanceFindFirst.mockResolvedValue(noShift(7));
    await expect(assertLineCleared('m1')).resolves.toBeUndefined();
  });
  it('has expired after 9 hours', async () => {
    mockClearanceFindFirst.mockResolvedValue(noShift(9));
    await expect(assertLineCleared('m1')).rejects.toThrow(/expired/i);
  });
  it('clearLine in SHIFT mode outside a shift stores an 8-hour expiresAt', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    mockRuleFindFirst.mockImplementation(async ({ where }: { where: { ruleKey: string } }) =>
      where.ruleKey === 'line_clearance.mode' ? { ruleKey: where.ruleKey, ruleValue: 'SHIFT' } : null,
    );
    mockShiftFindMany.mockResolvedValue([]);
    mockAllocationFindFirst.mockResolvedValue(null);
    mockClearanceCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', ...data }));
    const rec = await clearLine({ machineId: 'm1' });
    expect(rec.mode).toBe('SHIFT');
    expect(rec.shiftId).toBeNull();
    expect((rec.expiresAt as Date).getTime() - (rec.clearedAt as Date).getTime()).toBe(8 * 60 * 60 * 1000);
    mockRuleFindFirst.mockReset();
  });
});

describe('R2-309 a JOB clearance needs an order', () => {
  it('clearLine refuses when no order is booked and nothing is named, pointing at SHIFT mode', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    mockAllocationFindFirst.mockResolvedValue(null);
    await expect(clearLine({ machineId: 'm1' })).rejects.toThrow(/No order is booked.*SHIFT mode/);
    expect(mockClearanceCreate).not.toHaveBeenCalled();
  });
  it('an older JOB clearance with no order does not clear any order', async () => {
    mockClearanceFindFirst.mockResolvedValue({ mode: 'JOB', orderId: null, shiftId: null, clearedAt: new Date(), expiresAt: null });
    mockAllocationFindFirst.mockResolvedValue(null);
    await expect(assertLineCleared('m1', 'o9')).rejects.toThrow(/needs a line clearance/);
  });
});
