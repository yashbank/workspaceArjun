import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const machineAllocationFindFirst = vi.fn();
const machineAllocationCreate = vi.fn();
const jobPhaseFindFirst = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    misMachineAllocation: {
      findFirst: (...a: unknown[]) => machineAllocationFindFirst(...a),
      create: (...a: unknown[]) => machineAllocationCreate(...a),
    },
    misJobPhase: { findFirst: (...a: unknown[]) => jobPhaseFindFirst(...a) },
  },
}));

const mockAudit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

const { allocateMachine } = await import('./machines-board');

const START = new Date(2026, 8, 20, 6, 0);
const END = new Date(2026, 8, 20, 14, 0);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('SUPERVISOR');
  machineAllocationFindFirst.mockResolvedValue(null); // no overlap by default
  machineAllocationCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: 'alloc-1',
    ...data,
  }));
});

describe('allocateMachine — permission and overlap (unchanged behaviour)', () => {
  it('throws for a role with no production.write', async () => {
    getMisRole.mockResolvedValue('QC');
    await expect(
      allocateMachine({ machineId: 'm1', startsAt: START, endsAt: END }),
    ).rejects.toThrow(/Not permitted: production\.write/);
  });

  it('refuses an overlapping window', async () => {
    machineAllocationFindFirst.mockResolvedValue({ id: 'existing', startsAt: START, endsAt: END });
    await expect(
      allocateMachine({ machineId: 'm1', startsAt: START, endsAt: END }),
    ).rejects.toThrow(/already allocated/);
  });

  it('still accepts jobRef for the screen that has no order/phase picker yet', async () => {
    const rec = await allocateMachine({ machineId: 'm1', jobRef: 'J-118', startsAt: START, endsAt: END });
    expect(machineAllocationCreate.mock.calls[0][0].data.jobRef).toBe('J-118');
    expect(rec.jobRef).toBe('J-118');
  });
});

describe('allocateMachine — jobPhaseId validation (Phase 9, MIS-265)', () => {
  it('throws when the phase does not exist', async () => {
    jobPhaseFindFirst.mockResolvedValue(null);
    await expect(
      allocateMachine({ machineId: 'm1', jobPhaseId: 'ph-1', startsAt: START, endsAt: END }),
    ).rejects.toThrow(/no longer exists/);
  });

  it('refuses a phase from a different order than the one selected (MIS-261: "refused")', async () => {
    jobPhaseFindFirst.mockResolvedValue({
      id: 'ph-1',
      orderId: 'ord-OTHER',
      status: 'IN_PROGRESS',
      process: { name: 'Lamination' },
    });
    await expect(
      allocateMachine({ machineId: 'm1', orderId: 'ord-1', jobPhaseId: 'ph-1', startsAt: START, endsAt: END }),
    ).rejects.toThrow(/Lamination.*different order/);
  });

  it('refuses a phase that is not open (PENDING, SIGNED_OFF, or NOT_APPLICABLE)', async () => {
    jobPhaseFindFirst.mockResolvedValue({
      id: 'ph-1',
      orderId: 'ord-1',
      status: 'PENDING',
      process: { name: 'Die Cutting' },
    });
    await expect(
      allocateMachine({ machineId: 'm1', jobPhaseId: 'ph-1', startsAt: START, endsAt: END }),
    ).rejects.toThrow(/Die Cutting.*not open/);
  });

  it('accepts an active phase and derives orderId from it when none was given', async () => {
    jobPhaseFindFirst.mockResolvedValue({
      id: 'ph-1',
      orderId: 'ord-1',
      status: 'IN_PROGRESS',
      process: { name: 'Printing' },
    });
    const rec = await allocateMachine({ machineId: 'm1', jobPhaseId: 'ph-1', startsAt: START, endsAt: END });
    expect(rec.orderId).toBe('ord-1');
    expect(rec.jobPhaseId).toBe('ph-1');
  });

  it('accepts REOPENED as open, same as IN_PROGRESS (Appendix A §A.2)', async () => {
    jobPhaseFindFirst.mockResolvedValue({
      id: 'ph-1',
      orderId: 'ord-1',
      status: 'REOPENED',
      process: { name: 'Printing' },
    });
    await expect(
      allocateMachine({ machineId: 'm1', jobPhaseId: 'ph-1', startsAt: START, endsAt: END }),
    ).resolves.toMatchObject({ jobPhaseId: 'ph-1' });
  });
});
