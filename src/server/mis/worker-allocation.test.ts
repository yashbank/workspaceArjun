import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const resolveVisibleEmployeeWhere = vi.fn();
vi.mock('@/server/mis/visibility', () => ({
  resolveVisibleEmployeeWhere: (...a: unknown[]) => resolveVisibleEmployeeWhere(...a),
}));

const machineAllocationFindUnique = vi.fn();
const employeeFindMany = vi.fn();
const workerAllocationFindFirst = vi.fn();
const workerAllocationFindMany = vi.fn();
const workerAllocationCreate = vi.fn();
const workerAllocationUpdate = vi.fn();
const attendanceFindMany = vi.fn();
const leaveFindMany = vi.fn();
const jobPhaseFindFirst = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    misMachineAllocation: { findUnique: (...a: unknown[]) => machineAllocationFindUnique(...a) },
    misEmployee: { findMany: (...a: unknown[]) => employeeFindMany(...a) },
    misWorkerAllocation: {
      findFirst: (...a: unknown[]) => workerAllocationFindFirst(...a),
      findMany: (...a: unknown[]) => workerAllocationFindMany(...a),
      create: (...a: unknown[]) => workerAllocationCreate(...a),
      update: (...a: unknown[]) => workerAllocationUpdate(...a),
    },
    misAttendance: { findMany: (...a: unknown[]) => attendanceFindMany(...a) },
    misLeaveRequest: { findMany: (...a: unknown[]) => leaveFindMany(...a) },
    misJobPhase: { findFirst: (...a: unknown[]) => jobPhaseFindFirst(...a) },
  },
}));

const mockAudit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

const { assignWorkers, releaseWorker, getWorkerAvailability, getCrewSummary } =
  await import('./worker-allocation');

const DATE = new Date(2026, 8, 20);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('SUPERVISOR');
  resolveVisibleEmployeeWhere.mockResolvedValue({});
  machineAllocationFindUnique.mockResolvedValue({ id: 'ma-1', orderId: 'ord-1', releasedAt: null });
  employeeFindMany.mockResolvedValue([
    { id: 'e1', name: 'Ramesh' },
    { id: 'e2', name: 'Suresh' },
  ]);
  workerAllocationFindFirst.mockResolvedValue(null);
  workerAllocationCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: `wa-${data.employeeId}`,
    ...data,
  }));
});

describe('assignWorkers — permission and validity', () => {
  it('throws MisForbiddenError for a role with no production.write', async () => {
    getMisRole.mockResolvedValue('QC');
    await expect(
      assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e1'], shiftId: 's1', allocationDate: DATE }),
    ).rejects.toThrow(/Not permitted: production\.write/);
  });

  it('refuses an unknown machine allocation', async () => {
    machineAllocationFindUnique.mockResolvedValue(null);
    await expect(
      assignWorkers({ machineAllocationId: 'ma-x', employeeIds: ['e1'], shiftId: 's1', allocationDate: DATE }),
    ).rejects.toThrow(/no longer exists/);
  });

  it('refuses a machine allocation that has already ended', async () => {
    machineAllocationFindUnique.mockResolvedValue({ id: 'ma-1', releasedAt: new Date() });
    await expect(
      assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e1'], shiftId: 's1', allocationDate: DATE }),
    ).rejects.toThrow(/already ended/);
  });
});

describe('assignWorkers — jobPhaseId validation (Phase 9, MIS-265, closes the gap left since Phase 8)', () => {
  it('throws when the phase does not exist', async () => {
    jobPhaseFindFirst.mockResolvedValue(null);
    await expect(
      assignWorkers({
        machineAllocationId: 'ma-1',
        employeeIds: ['e1'],
        shiftId: 's1',
        allocationDate: DATE,
        jobPhaseId: 'ph-1',
      }),
    ).rejects.toThrow(/no longer exists/);
  });

  it('refuses a phase belonging to a different order than the machine allocation', async () => {
    machineAllocationFindUnique.mockResolvedValue({ id: 'ma-1', orderId: 'ord-1', releasedAt: null });
    jobPhaseFindFirst.mockResolvedValue({
      id: 'ph-1',
      orderId: 'ord-OTHER',
      status: 'IN_PROGRESS',
      process: { name: 'Lamination' },
    });
    await expect(
      assignWorkers({
        machineAllocationId: 'ma-1',
        employeeIds: ['e1'],
        shiftId: 's1',
        allocationDate: DATE,
        jobPhaseId: 'ph-1',
      }),
    ).rejects.toThrow(/Lamination.*different order/);
  });

  it('refuses a phase that is not open for assignment', async () => {
    jobPhaseFindFirst.mockResolvedValue({
      id: 'ph-1',
      orderId: 'ord-1',
      status: 'SIGNED_OFF',
      process: { name: 'Printing' },
    });
    await expect(
      assignWorkers({
        machineAllocationId: 'ma-1',
        employeeIds: ['e1'],
        shiftId: 's1',
        allocationDate: DATE,
        jobPhaseId: 'ph-1',
      }),
    ).rejects.toThrow(/Printing.*not open/);
  });

  it('proceeds when the phase is active and matches the allocation order', async () => {
    jobPhaseFindFirst.mockResolvedValue({
      id: 'ph-1',
      orderId: 'ord-1',
      status: 'IN_PROGRESS',
      process: { name: 'Printing' },
    });
    const result = await assignWorkers({
      machineAllocationId: 'ma-1',
      employeeIds: ['e1'],
      shiftId: 's1',
      allocationDate: DATE,
      jobPhaseId: 'ph-1',
    });
    expect(result.created).toHaveLength(1);
  });

  it('does not require a jobPhaseId at all (an order with no phase plan stays ungated — D10)', async () => {
    const result = await assignWorkers({
      machineAllocationId: 'ma-1',
      employeeIds: ['e1'],
      shiftId: 's1',
      allocationDate: DATE,
    });
    expect(jobPhaseFindFirst).not.toHaveBeenCalled();
    expect(result.created).toHaveLength(1);
  });
});

describe('assignWorkers — a crew in one action (MIS-263)', () => {
  it('assigns every employee passed in a single call', async () => {
    const result = await assignWorkers({
      machineAllocationId: 'ma-1',
      employeeIds: ['e1', 'e2'],
      shiftId: 's1',
      allocationDate: DATE,
    });
    expect(result.created).toHaveLength(2);
    expect(workerAllocationCreate).toHaveBeenCalledTimes(2);
  });

  it('is a no-op, not a warning, for someone already on this same allocation', async () => {
    workerAllocationFindFirst.mockResolvedValue({
      id: 'wa-existing',
      machineAllocationId: 'ma-1',
      machineAllocation: { machine: { name: 'Heidelberg' }, order: null },
      jobPhase: null,
    });
    const result = await assignWorkers({
      machineAllocationId: 'ma-1',
      employeeIds: ['e1'],
      shiftId: 's1',
      allocationDate: DATE,
    });
    expect(result.alreadyAssigned).toEqual(['e1']);
    expect(result.warnings).toHaveLength(0);
    expect(workerAllocationCreate).not.toHaveBeenCalled();
  });
});

describe('assignWorkers — overlap warns, never refuses (MIS-262 asymmetry with machines)', () => {
  it('warns and does NOT create when the employee is on a different machine allocation', async () => {
    workerAllocationFindFirst.mockResolvedValue({
      id: 'wa-conflict',
      machineAllocationId: 'ma-OTHER',
      machineAllocation: { machine: { name: 'Die Cutter 2' }, order: { orderNumber: 'ORD-118' } },
      jobPhase: { process: { name: 'Die Cutting' } },
    });

    const result = await assignWorkers({
      machineAllocationId: 'ma-1',
      employeeIds: ['e1'],
      shiftId: 's1',
      allocationDate: DATE,
    });

    expect(result.created).toHaveLength(0);
    expect(workerAllocationCreate).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([
      {
        employeeId: 'e1',
        employeeName: 'Ramesh',
        conflictingAllocationId: 'wa-conflict',
        conflictingMachineName: 'Die Cutter 2',
        conflictingProcessName: 'Die Cutting',
        conflictingOrderNumber: 'ORD-118',
      },
    ]);
  });

  it('names the conflicting job and machine (MIS-263 requires this, not "already assigned")', async () => {
    workerAllocationFindFirst.mockResolvedValue({
      id: 'wa-conflict',
      machineAllocationId: 'ma-OTHER',
      machineAllocation: { machine: { name: 'Die Cutter 2' }, order: { orderNumber: 'ORD-118' } },
      jobPhase: { process: { name: 'Die Cutting' } },
    });
    const result = await assignWorkers({
      machineAllocationId: 'ma-1',
      employeeIds: ['e1'],
      shiftId: 's1',
      allocationDate: DATE,
    });
    expect(result.warnings[0].conflictingMachineName).toBe('Die Cutter 2');
    expect(result.warnings[0].conflictingProcessName).toBe('Die Cutting');
  });

  it('proceeds and creates when the conflict is explicitly confirmed', async () => {
    workerAllocationFindFirst.mockResolvedValue({
      id: 'wa-conflict',
      machineAllocationId: 'ma-OTHER',
      machineAllocation: { machine: { name: 'Die Cutter 2' }, order: null },
      jobPhase: null,
    });

    const result = await assignWorkers({
      machineAllocationId: 'ma-1',
      employeeIds: ['e1'],
      shiftId: 's1',
      allocationDate: DATE,
      confirmOverlapFor: ['e1'],
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.created).toHaveLength(1);
    expect(workerAllocationCreate).toHaveBeenCalledTimes(1);
  });

  it('records the confirmed override in the audit trail', async () => {
    workerAllocationFindFirst.mockResolvedValue({
      id: 'wa-conflict',
      machineAllocationId: 'ma-OTHER',
      machineAllocation: { machine: { name: 'Die Cutter 2' }, order: null },
      jobPhase: null,
    });
    await assignWorkers({
      machineAllocationId: 'ma-1',
      employeeIds: ['e1'],
      shiftId: 's1',
      allocationDate: DATE,
      confirmOverlapFor: ['e1'],
    });
    const entry = mockAudit.mock.calls[0][0];
    expect(entry.after.confirmedOverConflictWith).toBe('wa-conflict');
  });

  it('does not let one conflicted worker block the rest of the crew', async () => {
    workerAllocationFindFirst.mockImplementation(({ where }: { where: { employeeId: string } }) =>
      where.employeeId === 'e1'
        ? {
            id: 'wa-conflict',
            machineAllocationId: 'ma-OTHER',
            machineAllocation: { machine: { name: 'Die Cutter 2' }, order: null },
            jobPhase: null,
          }
        : null,
    );

    const result = await assignWorkers({
      machineAllocationId: 'ma-1',
      employeeIds: ['e1', 'e2'],
      shiftId: 's1',
      allocationDate: DATE,
    });

    expect(result.warnings.map((w) => w.employeeId)).toEqual(['e1']);
    expect(result.created).toHaveLength(1);
    expect((result.created[0] as { employeeId: string }).employeeId).toBe('e2');
  });
});

describe('releaseWorker', () => {
  it('stamps releasedAt and preserves the rest of the row', async () => {
    workerAllocationUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'wa-1',
      ...data,
    }));
    const rec = await releaseWorker('wa-1');
    expect(rec.releasedAt).toBeInstanceOf(Date);
  });

  it('throws for a role with no production.write', async () => {
    getMisRole.mockResolvedValue('WORKER');
    await expect(releaseWorker('wa-1')).rejects.toThrow(/Not permitted: production\.write/);
  });
});

describe('getWorkerAvailability — availability is derived, one grouped set of queries', () => {
  it('returns free for a pool member with no allocation and no clock-in', async () => {
    employeeFindMany.mockResolvedValue([{ id: 'e1', name: 'Ramesh', employeeCode: 'E-01' }]);
    workerAllocationFindMany.mockResolvedValue([]);
    attendanceFindMany.mockResolvedValue([]);

    const rows = await getWorkerAvailability('s1', DATE);

    expect(rows).toEqual([
      { employeeId: 'e1', name: 'Ramesh', employeeCode: 'E-01', clockedIn: false, allocation: null },
    ]);
  });

  it('shows the machine and order for an assigned worker', async () => {
    employeeFindMany.mockResolvedValue([{ id: 'e1', name: 'Ramesh', employeeCode: 'E-01' }]);
    workerAllocationFindMany.mockResolvedValue([
      {
        id: 'wa-1',
        employeeId: 'e1',
        machineAllocation: { machine: { id: 'm1', name: 'Heidelberg SM-74' }, order: { orderNumber: 'ORD-118' } },
        jobPhase: { process: { name: 'Printing' } },
      },
    ]);
    attendanceFindMany.mockResolvedValue([{ employeeId: 'e1' }]);

    const rows = await getWorkerAvailability('s1', DATE);

    expect(rows[0].clockedIn).toBe(true);
    expect(rows[0].allocation).toEqual({
      workerAllocationId: 'wa-1',
      machineId: 'm1',
      machineName: 'Heidelberg SM-74',
      orderNumber: 'ORD-118',
      processName: 'Printing',
    });
  });

  it('is pool-scoped: composes resolveVisibleEmployeeWhere into the query', async () => {
    resolveVisibleEmployeeWhere.mockResolvedValue({ id: { in: ['e1'] } });
    employeeFindMany.mockResolvedValue([]);
    await getWorkerAvailability('s1', DATE);
    const { where } = employeeFindMany.mock.calls[0][0];
    expect(where.id).toEqual({ in: ['e1'] });
  });

  it('only offers WORKER and QC roles as candidates', async () => {
    employeeFindMany.mockResolvedValue([]);
    await getWorkerAvailability('s1', DATE);
    const { where } = employeeFindMany.mock.calls[0][0];
    expect(where.role).toEqual({ in: ['WORKER', 'QC'] });
  });

  it('returns an empty list rather than throwing when the pool is empty', async () => {
    employeeFindMany.mockResolvedValue([]);
    await expect(getWorkerAvailability('s1', DATE)).resolves.toEqual([]);
    expect(workerAllocationFindMany).not.toHaveBeenCalled();
  });
});

describe('getCrewSummary — "My crew today", pool-scoped unlike the attendance register', () => {
  it('counts only the caller\'s pool', async () => {
    resolveVisibleEmployeeWhere.mockResolvedValue({ id: { in: ['e1', 'e2', 'e3'] } });
    employeeFindMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]);
    attendanceFindMany.mockResolvedValue([
      { employeeId: 'e1', status: 'PRESENT', clockIn: new Date() },
    ]);
    leaveFindMany.mockResolvedValue([{ employeeId: 'e2' }]);

    const summary = await getCrewSummary(DATE);

    expect(summary).toEqual({ headcount: 3, present: 1, onLeave: 1, absent: 1, recorded: true });
  });

  it('reports recorded:false when nothing has been entered for the pool today', async () => {
    employeeFindMany.mockResolvedValue([{ id: 'e1' }]);
    attendanceFindMany.mockResolvedValue([]);
    leaveFindMany.mockResolvedValue([]);
    const summary = await getCrewSummary(DATE);
    expect(summary.recorded).toBe(false);
  });

  it('returns zeros for an empty pool rather than querying attendance', async () => {
    employeeFindMany.mockResolvedValue([]);
    const summary = await getCrewSummary(DATE);
    expect(summary).toEqual({ headcount: 0, present: 0, onLeave: 0, absent: 0, recorded: false });
    expect(attendanceFindMany).not.toHaveBeenCalled();
  });
});
