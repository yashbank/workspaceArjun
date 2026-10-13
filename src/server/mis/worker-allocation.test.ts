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
const auditCreate = vi.fn();
const machineAllocationFindMany = vi.fn();

// R3 WRK harness additions: assign/release run in a transaction, read the shift and write audit rows through it.
const fakeDb = {
    misMachineAllocation: {
      findUnique: (...a: unknown[]) => machineAllocationFindUnique(...a),
      findMany: (...a: unknown[]) => machineAllocationFindMany(...a),
    },
    misShift: { findFirst: async () => ({ id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '14:00' }) },
    misAuditLog: { create: (...a: unknown[]) => auditCreate(...a) },
    $transaction: async (fn: (tx: unknown) => unknown) => fakeDb_ref.current(fn),
    misEmployee: { findMany: (...a: unknown[]) => employeeFindMany(...a) },
    misWorkerAllocation: {
      updateMany: async () => ({ count: 1 }),
      findFirst: (...a: unknown[]) => workerAllocationFindFirst(...a),
      findMany: (...a: unknown[]) => workerAllocationFindMany(...a),
      create: (...a: unknown[]) => workerAllocationCreate(...a),
      update: (...a: unknown[]) => workerAllocationUpdate(...a),
    },
    misAttendance: { findMany: (...a: unknown[]) => attendanceFindMany(...a) },
    misLeaveRequest: { findMany: (...a: unknown[]) => leaveFindMany(...a) },
    misJobPhase: { findFirst: (...a: unknown[]) => jobPhaseFindFirst(...a) },
};
const fakeDb_ref = { current: async (fn: (tx: unknown) => unknown) => fn(fakeDb) };
vi.mock('@/server/db', () => ({ db: fakeDb }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));

const mockAudit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

const { assignWorkers, releaseWorker, getWorkerAvailability, getCrewSummary } =
  await import('./worker-allocation');

// R3 B88: a date key, one day after the faked 'now' so the crew is not 'live' (no NOT_IN warning).
const DATE = '2026-09-21';
const BOOKING = { startsAt: new Date('2026-09-21T00:30:00Z'), endsAt: new Date('2026-09-21T08:30:00Z') };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-20T05:00:00Z'));
  fakeDb_ref.current = async (fn) => fn(fakeDb);
  machineAllocationFindMany.mockResolvedValue([]);
  attendanceFindMany.mockResolvedValue([]);
  leaveFindMany.mockResolvedValue([]);
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('SUPERVISOR');
  resolveVisibleEmployeeWhere.mockResolvedValue({});
  machineAllocationFindUnique.mockResolvedValue({ id: 'ma-1', orderId: 'ord-1', releasedAt: null, ...BOOKING });
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
    machineAllocationFindUnique.mockResolvedValue({ id: 'ma-1', orderId: 'ord-1', releasedAt: null, ...BOOKING });
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

// R3 B98 replaces "overlap only warns" with a lock: the supervisor is blocked, ADMIN may override.
// The old tests encoded the warn-and-confirmOverlapFor contract; the matrix below is the new one.
const OTHER_ROW = {
  id: 'wa-conflict',
  machineAllocationId: 'ma-OTHER',
  machineAllocation: { machine: { name: 'Die Cutter 2' }, order: { orderNumber: 'ORD-118' } },
  jobPhase: { process: { name: 'Die Cutting' } },
};

describe('assignWorkers — overlap is blocked for a supervisor (R3 B98; was MIS-262 warn-only)', () => {
  it('blocks and does NOT create when the employee is on a different machine allocation', async () => {
    workerAllocationFindFirst.mockResolvedValue(OTHER_ROW);
    const result = await assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e1'], shiftId: 's1', allocationDate: DATE });
    expect(result.created).toHaveLength(0);
    expect(workerAllocationCreate).not.toHaveBeenCalled();
    expect(result.blocked).toEqual([
      {
        employeeId: 'e1',
        employeeName: 'Ramesh',
        kind: 'OVERLAP',
        conflictingAllocationId: 'wa-conflict',
        conflictingMachineName: 'Die Cutter 2',
        conflictingProcessName: 'Die Cutting',
        conflictingOrderNumber: 'ORD-118',
      },
    ]);
  });

  it('does not let one blocked worker block the rest of the crew', async () => {
    workerAllocationFindFirst.mockImplementation(({ where }: { where: { employeeId: string } }) =>
      where.employeeId === 'e1' ? OTHER_ROW : null,
    );
    const result = await assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e1', 'e2'], shiftId: 's1', allocationDate: DATE });
    expect(result.blocked.map((w) => w.employeeId)).toEqual(['e1']);
    expect(result.created).toHaveLength(1);
    expect((result.created[0] as { employeeId: string }).employeeId).toBe('e2');
  });
});

describe('assignWorkers — role x conflict x flag matrix (R3 B98)', () => {
  // Today at 10:30 IST, inside the 06:00-14:00 shift, so NOT_IN applies.
  const TODAY = '2026-09-20';
  const todayBooking = { id: 'ma-1', orderId: 'ord-1', releasedAt: null, startsAt: new Date('2026-09-20T00:30:00Z'), endsAt: new Date('2026-09-20T08:30:00Z') };

  const setup = (conflict: 'OVERLAP' | 'ON_LEAVE' | 'NOT_IN') => {
    machineAllocationFindUnique.mockResolvedValue(todayBooking);
    workerAllocationFindFirst.mockImplementation(({ where }: { where: { machineAllocationId?: unknown } }) =>
      conflict === 'OVERLAP' && typeof where.machineAllocationId === 'object' ? OTHER_ROW : null,
    );
    // Clocked in unless the case is NOT_IN.
    attendanceFindMany.mockResolvedValue(conflict === 'NOT_IN' ? [] : [{ employeeId: 'e1', clockIn: new Date(), clockOut: null, status: 'PRESENT' }]);
    leaveFindMany.mockResolvedValue(conflict === 'ON_LEAVE' ? [{ employeeId: 'e1' }] : []);
  };

  type Flag = 'none' | 'confirm' | 'override';
  const flags = (f: Flag) => (f === 'confirm' ? { confirmWarnings: true } : f === 'override' ? { override: { reason: 'cover for absence' } } : {});

  // [role, conflict, flag, created?]
  const MATRIX: [string, 'OVERLAP' | 'ON_LEAVE' | 'NOT_IN', Flag, boolean][] = [
    ['SUPERVISOR', 'OVERLAP', 'none', false],
    ['SUPERVISOR', 'OVERLAP', 'confirm', false],
    ['SUPERVISOR', 'OVERLAP', 'override', false],
    ['SUPERVISOR', 'ON_LEAVE', 'none', false],
    ['SUPERVISOR', 'ON_LEAVE', 'confirm', false],
    ['SUPERVISOR', 'ON_LEAVE', 'override', false],
    ['SUPERVISOR', 'NOT_IN', 'none', false],
    ['SUPERVISOR', 'NOT_IN', 'confirm', true],
    ['SUPERVISOR', 'NOT_IN', 'override', false],
    ['ADMIN', 'OVERLAP', 'none', false],
    ['ADMIN', 'OVERLAP', 'confirm', false],
    ['ADMIN', 'OVERLAP', 'override', true],
    ['ADMIN', 'ON_LEAVE', 'none', false],
    ['ADMIN', 'ON_LEAVE', 'confirm', false],
    ['ADMIN', 'ON_LEAVE', 'override', true],
    ['ADMIN', 'NOT_IN', 'none', false],
    ['ADMIN', 'NOT_IN', 'confirm', true],
    ['ADMIN', 'NOT_IN', 'override', true],
  ];

  it.each(MATRIX)('%s x %s x %s -> created: %s', async (role, conflict, flag, created) => {
    getMisRole.mockResolvedValue(role);
    setup(conflict);
    const result = await assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e1'], shiftId: 's1', allocationDate: TODAY, ...flags(flag) });
    expect(result.created).toHaveLength(created ? 1 : 0);
    expect(workerAllocationCreate).toHaveBeenCalledTimes(created ? 1 : 0);
    if (!created) expect(result.blocked.length + result.warnings.length).toBe(1);
  });

  it('an override is written to the row notes and to the audit trail', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    setup('ON_LEAVE');
    await assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e1'], shiftId: 's1', allocationDate: TODAY, override: { reason: 'cover for absence' } });
    expect(workerAllocationCreate.mock.calls[0][0].data.notes).toContain('[override] cover for absence');
    const audit = mockAudit.mock.calls.map((c) => c[0]).find((d) => d.action === 'ASSIGN_WORKER_OVERRIDE');
    expect(audit.after).toMatchObject({ employeeId: 'e1', conflicts: ['ON_LEAVE'], reason: 'cover for absence' });
  });

  it('an override reason shorter than 3 characters does not count', async () => {
    getMisRole.mockResolvedValue('OWNER');
    setup('OVERLAP');
    const result = await assignWorkers({ machineAllocationId: 'ma-1', employeeIds: ['e1'], shiftId: 's1', allocationDate: TODAY, override: { reason: 'x' } });
    expect(result.created).toHaveLength(0);
  });
});

describe('releaseWorker', () => {
  it('stamps releasedAt and preserves the rest of the row', async () => {
    workerAllocationUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'wa-1',
      ...data,
    }));
    workerAllocationFindFirst.mockResolvedValue({ id: 'wa-1', employeeId: 'e1', releasedAt: null }); // R3 B92: open rows only
    employeeFindMany.mockResolvedValue([{ id: 'e1' }]);
    workerAllocationFindMany.mockResolvedValue([{ id: 'wa-1', employeeId: 'e1', machineAllocationId: 'ma-1' }]);
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
      // R3 B87/B89: `allocations` (an array) and a `presence` replace the single `allocation`.
      { employeeId: 'e1', name: 'Ramesh', employeeCode: 'E-01', clockedIn: false, presence: 'NOT_IN', allocations: [] },
    ]);
  });

  it('shows the machine and order for an assigned worker', async () => {
    employeeFindMany.mockResolvedValue([{ id: 'e1', name: 'Ramesh', employeeCode: 'E-01' }]);
    workerAllocationFindMany.mockResolvedValue([
      {
        id: 'wa-1',
        employeeId: 'e1',
        machineAllocationId: 'ma-1',
        machineAllocation: { machine: { id: 'm1', name: 'Heidelberg SM-74' }, order: { orderNumber: 'ORD-118' } },
        jobPhase: { process: { name: 'Printing' } },
      },
    ]);
    attendanceFindMany.mockResolvedValue([{ employeeId: 'e1', clockIn: new Date(), clockOut: null, status: 'PRESENT' }]); // R3 B89: presence needs the row

    const rows = await getWorkerAvailability('s1', DATE);

    expect(rows[0].clockedIn).toBe(true);
    expect(rows[0].allocations).toEqual([{
      id: 'wa-1',
      machineAllocationId: 'ma-1',
      machineId: 'm1',
      machineName: 'Heidelberg SM-74',
      orderNumber: 'ORD-118',
      processName: 'Printing',
    }]);
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

    // R3 B100 adds onMachines / free / unstaffedBookings.
    expect(summary).toMatchObject({ headcount: 3, present: 1, onLeave: 1, absent: 1, recorded: true });
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
    expect(summary).toMatchObject({ headcount: 0, present: 0, onLeave: 0, absent: 0, recorded: false });
    expect(attendanceFindMany).not.toHaveBeenCalled();
  });
});
