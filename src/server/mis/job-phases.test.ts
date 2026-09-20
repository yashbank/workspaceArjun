import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const phaseFindFirst = vi.fn();
const phaseFindMany = vi.fn();
const phaseUpdate = vi.fn();
const phaseUpdateMany = vi.fn();
const phaseCount = vi.fn();
const phaseCreateMany = vi.fn();
const logFindMany = vi.fn();
const logCount = vi.fn();
const logUpdate = vi.fn();
const qcFindMany = vi.fn();
const qcFindUnique = vi.fn();
const qcUpdate = vi.fn();
const employeeFindUnique = vi.fn();
const employeeFindFirst = vi.fn();
const materialFindMany = vi.fn();
const processFindMany = vi.fn();
const processCreate = vi.fn();
const notificationCreate = vi.fn();

const dbMock = {
  misJobPhase: {
    findFirst: (...a: unknown[]) => phaseFindFirst(...a),
    findMany: (...a: unknown[]) => phaseFindMany(...a),
    update: (...a: unknown[]) => phaseUpdate(...a),
    updateMany: (...a: unknown[]) => phaseUpdateMany(...a),
    count: (...a: unknown[]) => phaseCount(...a),
    createMany: (...a: unknown[]) => phaseCreateMany(...a),
  },
  misProductionLog: {
    findMany: (...a: unknown[]) => logFindMany(...a),
    count: (...a: unknown[]) => logCount(...a),
    update: (...a: unknown[]) => logUpdate(...a),
  },
  misQcCheck: {
    findMany: (...a: unknown[]) => qcFindMany(...a),
    findUnique: (...a: unknown[]) => qcFindUnique(...a),
    update: (...a: unknown[]) => qcUpdate(...a),
  },
  misEmployee: {
    findUnique: (...a: unknown[]) => employeeFindUnique(...a),
    findFirst: (...a: unknown[]) => employeeFindFirst(...a),
  },
  misBomMaterial: { findMany: (...a: unknown[]) => materialFindMany(...a) },
  misProcess: {
    findMany: (...a: unknown[]) => processFindMany(...a),
    create: (...a: unknown[]) => processCreate(...a),
  },
  notification: { create: (...a: unknown[]) => notificationCreate(...a) },
  $transaction: (fn: (tx: unknown) => unknown) => fn(dbMock),
};
vi.mock('@/server/db', () => ({ db: dbMock }));

const mockAudit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

const {
  startPhase,
  signOffPhase,
  markNotApplicable,
  restorePhase,
  reopenPhase,
  reassignInCharge,
  acknowledgeQcFailure,
  setWasteReason,
  resolveJobPhaseForProduction,
  getSignOffSummary,
  ensureBprProcesses,
  planPhases,
  isActiveStatus,
  JobPhaseError,
} = await import('./job-phases');

const IN_CHARGE_USER = 'user-incharge';
const IN_CHARGE_EMPLOYEE = 'emp-incharge';

function phase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ph-2',
    orderId: 'ord-1',
    sequence: 2,
    status: 'IN_PROGRESS',
    bomStageId: null,
    inChargeEmployeeId: IN_CHARGE_EMPLOYEE,
    notes: null,
    signedOffAt: null,
    process: { id: 'proc-2', name: 'Lamination', nameHi: null, code: 'PROC-005' },
    inCharge: {
      id: IN_CHARGE_EMPLOYEE,
      name: 'Vali Sah',
      employeeCode: 'E-22',
      userProfileId: IN_CHARGE_USER,
    },
    order: { id: 'ord-1', orderNumber: 'ORD-118' },
    ...overrides,
  };
}

/** A phase with everything a sign-off needs already satisfied. */
function readyToSign() {
  phaseFindFirst.mockResolvedValue(phase());
  logFindMany.mockResolvedValue([
    { id: 'log-1', qtyProduced: 100, qtyWaste: 2, wasteReason: 'Setup sheets', loggedAt: new Date(), unit: 'Sheets' },
  ]);
  qcFindMany.mockResolvedValue([]);
  phaseUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: 'ph-2',
    orderId: 'ord-1',
    sequence: 2,
    ...data,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: IN_CHARGE_USER });
  getMisRole.mockResolvedValue('SUPERVISOR');
  employeeFindUnique.mockResolvedValue({ id: IN_CHARGE_EMPLOYEE, name: 'Vali Sah' });
  phaseFindMany.mockResolvedValue([]);
  logCount.mockResolvedValue(0);
  qcFindMany.mockResolvedValue([]);
});

describe('permission gates', () => {
  const NO_PHASE_WRITE = ['QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'WORKER', 'STORE_GUY'] as const;

  it.each(NO_PHASE_WRITE)('startPhase throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(startPhase('ph-2')).rejects.toThrow(/Not permitted: phase\.write/);
  });

  it.each(NO_PHASE_WRITE)('signOffPhase throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(signOffPhase('ph-2')).rejects.toThrow(/Not permitted: phase\.write/);
  });

  it('reopenPhase is OWNER-only — ADMIN is refused', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    await expect(reopenPhase('ph-2', 'wrong shade')).rejects.toThrow(/Not permitted: phase\.reopen/);
  });

  it('reopenPhase is allowed for OWNER', async () => {
    getMisRole.mockResolvedValue('OWNER');
    phaseFindFirst.mockResolvedValue(phase({ status: 'SIGNED_OFF', signedOffAt: new Date() }));
    phaseUpdate.mockResolvedValue({ id: 'ph-2', orderId: 'ord-1', status: 'REOPENED', sequence: 2 });
    phaseUpdateMany.mockResolvedValue({ count: 1 });
    await expect(reopenPhase('ph-2', 'wrong shade')).resolves.toMatchObject({ status: 'REOPENED' });
  });
});

describe('the transition table', () => {
  it('refuses a transition to the state the phase is already in, with ALREADY_IN_STATE', async () => {
    phaseFindFirst.mockResolvedValue(phase({ status: 'IN_PROGRESS' }));
    await expect(startPhase('ph-2')).rejects.toMatchObject({ reason: 'ALREADY_IN_STATE' });
  });

  it('refuses SIGNED_OFF → IN_PROGRESS', async () => {
    phaseFindFirst.mockResolvedValue(phase({ status: 'SIGNED_OFF' }));
    await expect(startPhase('ph-2')).rejects.toMatchObject({ reason: 'ILLEGAL_TRANSITION' });
  });

  it('refuses NOT_APPLICABLE → IN_PROGRESS (it must be restored first)', async () => {
    phaseFindFirst.mockResolvedValue(phase({ status: 'NOT_APPLICABLE' }));
    await expect(startPhase('ph-2')).rejects.toMatchObject({ reason: 'ILLEGAL_TRANSITION' });
  });

  it('refuses PENDING → SIGNED_OFF (you cannot sign a phase that never ran)', async () => {
    phaseFindFirst.mockResolvedValue(phase({ status: 'PENDING' }));
    await expect(signOffPhase('ph-2')).rejects.toMatchObject({ reason: 'ILLEGAL_TRANSITION' });
  });

  it('refuses SIGNED_OFF → NOT_APPLICABLE', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    phaseFindFirst.mockResolvedValue(phase({ status: 'SIGNED_OFF' }));
    await expect(markNotApplicable('ph-2', 'not needed')).rejects.toMatchObject({
      reason: 'ILLEGAL_TRANSITION',
    });
  });

  it('allows REOPENED → SIGNED_OFF', async () => {
    readyToSign();
    phaseFindFirst.mockResolvedValue(phase({ status: 'REOPENED' }));
    await expect(signOffPhase('ph-2')).resolves.toMatchObject({ status: 'SIGNED_OFF' });
  });
});

describe('REOPENED behaves like IN_PROGRESS at every gate, and stays distinct', () => {
  it('is an active status', () => {
    expect(isActiveStatus('REOPENED')).toBe(true);
    expect(isActiveStatus('IN_PROGRESS')).toBe(true);
    expect(isActiveStatus('SIGNED_OFF')).toBe(false);
    expect(isActiveStatus('PENDING')).toBe(false);
  });

  it('accepts production like IN_PROGRESS does', async () => {
    phaseFindMany.mockResolvedValue([phase({ id: 'ph-2', status: 'REOPENED' })]);
    await expect(resolveJobPhaseForProduction('ord-1')).resolves.toBe('ph-2');
  });

  it('but blocks the next phase, because it is not SIGNED_OFF', async () => {
    phaseFindFirst
      .mockResolvedValueOnce(phase({ id: 'ph-3', sequence: 3, status: 'PENDING' }))
      .mockResolvedValueOnce(phase({ id: 'ph-2', sequence: 2, status: 'REOPENED' }));
    await expect(startPhase('ph-3')).rejects.toMatchObject({
      reason: 'PREVIOUS_PHASE_NOT_SIGNED_OFF',
    });
  });
});

describe('the sequential gate', () => {
  it('names the blocking phase and who holds it', async () => {
    phaseFindFirst
      .mockResolvedValueOnce(phase({ id: 'ph-3', sequence: 3, status: 'PENDING' }))
      .mockResolvedValueOnce(
        phase({
          id: 'ph-2',
          sequence: 2,
          status: 'IN_PROGRESS',
          process: { id: 'proc-2', name: 'Printing', nameHi: null, code: 'PROC-003' },
        }),
      );
    const error = await startPhase('ph-3').catch((e) => e);
    expect(error.reason).toBe('PREVIOUS_PHASE_NOT_SIGNED_OFF');
    expect(error.message).toMatch(/Printing/);
    expect(error.message).toMatch(/Vali Sah/);
  });

  it('starts when there is no applicable predecessor', async () => {
    phaseFindFirst
      .mockResolvedValueOnce(phase({ id: 'ph-1', sequence: 1, status: 'PENDING' }))
      .mockResolvedValueOnce(null);
    phaseUpdate.mockResolvedValue({ id: 'ph-1', orderId: 'ord-1', status: 'IN_PROGRESS', sequence: 1 });
    await expect(startPhase('ph-1')).resolves.toMatchObject({ status: 'IN_PROGRESS' });
  });

  it('takes the starter as in-charge when none is assigned (D12)', async () => {
    phaseFindFirst
      .mockResolvedValueOnce(phase({ id: 'ph-1', sequence: 1, status: 'PENDING', inChargeEmployeeId: null, inCharge: null }))
      .mockResolvedValueOnce(null);
    phaseUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'ph-1', orderId: 'ord-1', sequence: 1, ...data }));
    await startPhase('ph-1');
    expect(phaseUpdate.mock.calls[0][0].data.inChargeEmployeeId).toBe(IN_CHARGE_EMPLOYEE);
  });
});

describe('only the in-charge signs (D12)', () => {
  it('refuses an ADMIN who is not the in-charge', async () => {
    readyToSign();
    getMisRole.mockResolvedValue('ADMIN');
    getCurrentUser.mockResolvedValue({ id: 'user-admin' });
    await expect(signOffPhase('ph-2')).rejects.toMatchObject({ reason: 'NOT_THE_IN_CHARGE' });
  });

  it('refuses the OWNER too — a signature someone else can apply is not a signature', async () => {
    readyToSign();
    getMisRole.mockResolvedValue('OWNER');
    getCurrentUser.mockResolvedValue({ id: 'user-owner' });
    await expect(signOffPhase('ph-2')).rejects.toMatchObject({ reason: 'NOT_THE_IN_CHARGE' });
  });

  it('names who can sign in the refusal', async () => {
    readyToSign();
    getCurrentUser.mockResolvedValue({ id: 'someone-else' });
    await expect(signOffPhase('ph-2')).rejects.toThrow(/Vali Sah/);
  });

  it('allows the in-charge', async () => {
    readyToSign();
    await expect(signOffPhase('ph-2')).resolves.toMatchObject({ status: 'SIGNED_OFF' });
  });
});

describe('sign-off preconditions', () => {
  it('refuses when nothing has been recorded', async () => {
    phaseFindFirst.mockResolvedValue(phase());
    logFindMany.mockResolvedValue([]);
    await expect(signOffPhase('ph-2')).rejects.toMatchObject({ reason: 'NO_PRODUCTION_RECORDED' });
  });

  it('refuses when a wastage figure has no reason (D11)', async () => {
    phaseFindFirst.mockResolvedValue(phase());
    logFindMany.mockResolvedValue([
      { id: 'log-1', qtyProduced: 100, qtyWaste: 5, wasteReason: null, loggedAt: new Date(), unit: 'Sheets' },
    ]);
    await expect(signOffPhase('ph-2')).rejects.toMatchObject({ reason: 'WASTE_REASON_MISSING' });
  });

  it('ignores a blank-but-present reason', async () => {
    phaseFindFirst.mockResolvedValue(phase());
    logFindMany.mockResolvedValue([
      { id: 'log-1', qtyProduced: 100, qtyWaste: 5, wasteReason: '   ', loggedAt: new Date(), unit: 'Sheets' },
    ]);
    await expect(signOffPhase('ph-2')).rejects.toMatchObject({ reason: 'WASTE_REASON_MISSING' });
  });

  it('does not ask for a reason when nothing was wasted', async () => {
    phaseFindFirst.mockResolvedValue(phase());
    logFindMany.mockResolvedValue([
      { id: 'log-1', qtyProduced: 100, qtyWaste: 0, wasteReason: null, loggedAt: new Date(), unit: 'Sheets' },
    ]);
    phaseUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'ph-2', orderId: 'ord-1', sequence: 2, ...data }));
    await expect(signOffPhase('ph-2')).resolves.toMatchObject({ status: 'SIGNED_OFF' });
  });

  it('refuses while a failed QC check is unacknowledged', async () => {
    phaseFindFirst.mockResolvedValue(phase());
    logFindMany.mockResolvedValue([
      { id: 'log-1', qtyProduced: 100, qtyWaste: 0, wasteReason: null, loggedAt: new Date(), unit: 'Sheets' },
    ]);
    qcFindMany.mockResolvedValue([{ id: 'qc-1', parameterName: 'Shade', checkTime: new Date() }]);
    await expect(signOffPhase('ph-2')).rejects.toMatchObject({ reason: 'QC_FAILURE_UNACKNOWLEDGED' });
  });

  it('stamps the server clock and accepts no timestamp from the caller', async () => {
    readyToSign();
    const before = Date.now();
    await signOffPhase('ph-2', { notes: 'done' });
    const written = phaseUpdate.mock.calls[0][0].data.signedOffAt as Date;
    expect(written).toBeInstanceOf(Date);
    expect(written.getTime()).toBeGreaterThanOrEqual(before);
    expect(written.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('the handover notification', () => {
  it('writes a row for the next phase in-charge, inside the sign-off transaction', async () => {
    readyToSign();
    phaseFindFirst
      .mockResolvedValueOnce(phase())
      .mockResolvedValueOnce(
        phase({
          id: 'ph-3',
          sequence: 3,
          status: 'PENDING',
          process: { id: 'proc-3', name: 'Die Cutting', nameHi: null, code: 'PROC-001' },
          inCharge: { id: 'emp-next', name: 'K. Dinesh', employeeCode: 'E-31', userProfileId: 'user-next' },
        }),
      );
    await signOffPhase('ph-2');
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    const { data } = notificationCreate.mock.calls[0][0];
    expect(data.userId).toBe('user-next');
    expect(data.type).toBe('mis.phase_ready');
  });

  it('still signs off when the next in-charge has no login', async () => {
    readyToSign();
    phaseFindFirst
      .mockResolvedValueOnce(phase())
      .mockResolvedValueOnce(
        phase({
          id: 'ph-3',
          sequence: 3,
          inCharge: { id: 'emp-next', name: 'Kali Charan', employeeCode: 'E-40', userProfileId: null },
        }),
      );
    await expect(signOffPhase('ph-2')).resolves.toMatchObject({ status: 'SIGNED_OFF' });
    expect(notificationCreate).not.toHaveBeenCalled();
  });
});

describe('reopening', () => {
  it('flags downstream phases rather than cascading a status onto them', async () => {
    getMisRole.mockResolvedValue('OWNER');
    phaseFindFirst.mockResolvedValue(phase({ status: 'SIGNED_OFF', signedOffAt: new Date() }));
    phaseUpdate.mockResolvedValue({ id: 'ph-2', orderId: 'ord-1', status: 'REOPENED', sequence: 2 });
    phaseUpdateMany.mockResolvedValue({ count: 2 });

    await reopenPhase('ph-2', 'shade drifted');

    expect(phaseUpdateMany).toHaveBeenCalledTimes(1);
    expect(phaseUpdateMany.mock.calls[0][0].data).toEqual({ downstreamFlagged: true });
  });

  it('needs a reason', async () => {
    getMisRole.mockResolvedValue('OWNER');
    await expect(reopenPhase('ph-2', '  ')).rejects.toMatchObject({ reason: 'REASON_REQUIRED' });
  });
});

describe('skipping and restoring', () => {
  it('refuses to skip a phase that already has production against it', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    phaseFindFirst.mockResolvedValue(phase({ status: 'IN_PROGRESS' }));
    logCount.mockResolvedValue(3);
    await expect(markNotApplicable('ph-2', 'not needed')).rejects.toMatchObject({
      reason: 'PRODUCTION_ALREADY_RECORDED',
    });
  });

  it('refuses a SUPERVISOR — routing is a planning act', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(markNotApplicable('ph-2', 'not needed')).rejects.toMatchObject({
      reason: 'ILLEGAL_TRANSITION',
    });
  });

  it('refuses to restore behind a phase that has already started', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    phaseFindFirst
      .mockResolvedValueOnce(phase({ status: 'NOT_APPLICABLE' }))
      .mockResolvedValueOnce(phase({ id: 'ph-3', sequence: 3, status: 'IN_PROGRESS' }));
    await expect(restorePhase('ph-2', 'it is needed after all')).rejects.toMatchObject({
      reason: 'LATER_PHASE_STARTED',
    });
  });
});

describe('reassigning the in-charge (D12)', () => {
  it('lets an ADMIN move who signs', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    phaseFindFirst.mockResolvedValue(phase());
    employeeFindFirst.mockResolvedValue({ id: 'emp-new', name: 'Saideep' });
    phaseUpdate.mockResolvedValue({ id: 'ph-2', inChargeEmployeeId: 'emp-new' });
    await expect(reassignInCharge('ph-2', 'emp-new')).resolves.toMatchObject({
      inChargeEmployeeId: 'emp-new',
    });
  });

  it('records the outgoing in-charge in the audit trail', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    phaseFindFirst.mockResolvedValue(phase());
    employeeFindFirst.mockResolvedValue({ id: 'emp-new', name: 'Saideep' });
    phaseUpdate.mockResolvedValue({ id: 'ph-2', inChargeEmployeeId: 'emp-new' });
    await reassignInCharge('ph-2', 'emp-new');
    const entry = mockAudit.mock.calls[0][0];
    expect(entry.before.inCharge).toBe('Vali Sah');
    expect(entry.after.inCharge).toBe('Saideep');
  });

  it('refuses a SUPERVISOR', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(reassignInCharge('ph-2', 'emp-new')).rejects.toMatchObject({
      reason: 'ILLEGAL_TRANSITION',
    });
  });

  it('refuses once the phase is signed — it would not change who signed it', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    phaseFindFirst.mockResolvedValue(phase({ status: 'SIGNED_OFF' }));
    await expect(reassignInCharge('ph-2', 'emp-new')).rejects.toMatchObject({
      reason: 'ILLEGAL_TRANSITION',
    });
  });
});

describe('acknowledging a QC failure is not resolving it (MIS-163)', () => {
  it('leaves the result FAIL and stamps who acknowledged it', async () => {
    qcFindUnique.mockResolvedValue({ id: 'qc-1', result: 'FAIL', acknowledgedAt: null });
    qcUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'qc-1',
      result: 'FAIL',
      ...data,
    }));
    const rec = await acknowledgeQcFailure('qc-1', 'passing on, customer informed');
    expect(rec.result).toBe('FAIL');
    expect(rec.acknowledgedAt).toBeInstanceOf(Date);
    expect(qcUpdate.mock.calls[0][0].data.acknowledgedById).toBe(IN_CHARGE_USER);
  });

  it('refuses to acknowledge a check that did not fail', async () => {
    qcFindUnique.mockResolvedValue({ id: 'qc-1', result: 'PASS', acknowledgedAt: null });
    await expect(acknowledgeQcFailure('qc-1')).rejects.toMatchObject({ reason: 'ILLEGAL_TRANSITION' });
  });
});

describe('wastage reasons (D11)', () => {
  it('refuses a blank reason', async () => {
    await expect(setWasteReason('log-1', '   ')).rejects.toMatchObject({ reason: 'REASON_REQUIRED' });
  });

  it('records a real one', async () => {
    logUpdate.mockResolvedValue({ id: 'log-1', wasteReason: 'Make-ready sheets' });
    await expect(setWasteReason('log-1', '  Make-ready sheets ')).resolves.toMatchObject({
      wasteReason: 'Make-ready sheets',
    });
    expect(logUpdate.mock.calls[0][0].data.wasteReason).toBe('Make-ready sheets');
  });
});

describe('production attribution (Appendix A §A.8)', () => {
  it('returns null for an order with no phases — ungated, by D10', async () => {
    phaseFindMany.mockResolvedValue([]);
    await expect(resolveJobPhaseForProduction('ord-1')).resolves.toBeNull();
  });

  it('resolves the single active phase', async () => {
    phaseFindMany.mockResolvedValue([
      phase({ id: 'ph-1', sequence: 1, status: 'SIGNED_OFF' }),
      phase({ id: 'ph-2', sequence: 2, status: 'IN_PROGRESS' }),
      phase({ id: 'ph-3', sequence: 3, status: 'PENDING' }),
    ]);
    await expect(resolveJobPhaseForProduction('ord-1')).resolves.toBe('ph-2');
  });

  it('refuses when nothing is running, naming the phase to start and who holds it', async () => {
    phaseFindMany.mockResolvedValue([
      phase({ id: 'ph-1', sequence: 1, status: 'SIGNED_OFF' }),
      phase({
        id: 'ph-3',
        sequence: 3,
        status: 'PENDING',
        process: { id: 'proc-3', name: 'Die Cutting', nameHi: null, code: 'PROC-001' },
      }),
    ]);
    const error = await resolveJobPhaseForProduction('ord-1').catch((e) => e);
    expect(error).toBeInstanceOf(JobPhaseError);
    expect(error.reason).toBe('NO_ACTIVE_PHASE');
    expect(error.message).toMatch(/Die Cutting/);
    expect(error.message).toMatch(/Vali Sah/);
  });

  it('refuses rather than guessing when a reopened phase runs beside a later one', async () => {
    phaseFindMany.mockResolvedValue([
      phase({ id: 'ph-1', sequence: 1, status: 'REOPENED' }),
      phase({ id: 'ph-2', sequence: 2, status: 'IN_PROGRESS' }),
    ]);
    await expect(resolveJobPhaseForProduction('ord-1')).rejects.toMatchObject({
      reason: 'AMBIGUOUS_ACTIVE_PHASE',
    });
  });

  it('refuses an explicit phase that is not active', async () => {
    phaseFindFirst.mockResolvedValue(phase({ status: 'SIGNED_OFF' }));
    await expect(resolveJobPhaseForProduction('ord-1', 'ph-2')).rejects.toMatchObject({
      reason: 'NO_ACTIVE_PHASE',
    });
  });

  it('refuses an explicit phase belonging to another order', async () => {
    phaseFindFirst.mockResolvedValue(null);
    await expect(resolveJobPhaseForProduction('ord-1', 'ph-9')).rejects.toMatchObject({
      reason: 'PHASE_NOT_FOUND',
    });
  });
});

describe('seeding the BPR work flow', () => {
  it('creates only the processes missing from the master, matched by name', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    processFindMany.mockResolvedValue([
      { id: 'p1', name: 'Printing', code: 'PROC-003' },
      { id: 'p2', name: 'Lamination', code: 'PROC-005' },
      { id: 'p3', name: 'Coating', code: 'PROC-004' },
      { id: 'p4', name: 'Die Cutting', code: 'PROC-001' },
      { id: 'p5', name: 'Foiling', code: 'PROC-007' },
    ]);
    processCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => data);

    const result = await ensureBprProcesses();

    expect(result.created).toEqual([
      'Board Trimming',
      'Corrugation',
      'Blanking',
      'Sorting',
      'Window Pasting',
      'Pasting',
    ]);
    expect(result.alreadyPresent).toBe(5);
  });

  it('matches names case- and space-insensitively, so it never double-seeds', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    processFindMany.mockResolvedValue([{ id: 'p1', name: '  die   cutting ', code: 'PROC-001' }]);
    processCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => data);
    const result = await ensureBprProcesses();
    expect(result.created).not.toContain('Die Cutting');
  });

  it('never reuses a code already in the master', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    processFindMany.mockResolvedValue([{ id: 'p1', name: 'Something else', code: 'PROC-020' }]);
    processCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => data);
    await ensureBprProcesses();
    const codes = processCreate.mock.calls.map((c) => c[0].data.code);
    expect(codes).not.toContain('PROC-020');
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('planning a job card', () => {
  it('writes unticked processes as NOT_APPLICABLE rather than leaving them out', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    phaseCount.mockResolvedValue(0);
    phaseCreateMany.mockResolvedValue({ count: 3 });
    phaseFindMany.mockResolvedValue([]);

    await planPhases('ord-1', [
      { processId: 'proc-1', applies: true },
      { processId: 'proc-2', applies: false },
      { processId: 'proc-3', applies: true },
    ]);

    const rows = phaseCreateMany.mock.calls[0][0].data;
    expect(rows.map((r: { status: string }) => r.status)).toEqual([
      'PENDING',
      'NOT_APPLICABLE',
      'PENDING',
    ]);
    expect(rows.map((r: { sequence: number }) => r.sequence)).toEqual([1, 2, 3]);
  });

  it('refuses to re-plan an order that already has phases', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    phaseCount.mockResolvedValue(4);
    await expect(planPhases('ord-1', [])).rejects.toMatchObject({ reason: 'ILLEGAL_TRANSITION' });
  });
});

describe('the sign-off summary (MIS-164)', () => {
  it('reads output against what the previous phase handed over (D13)', async () => {
    phaseFindFirst
      .mockResolvedValueOnce(phase())
      .mockResolvedValueOnce(
        phase({
          id: 'ph-1',
          sequence: 1,
          status: 'SIGNED_OFF',
          process: { id: 'proc-1', name: 'Printing', nameHi: null, code: 'PROC-003' },
        }),
      );
    logFindMany
      .mockResolvedValueOnce([
        { qtyProduced: 980, qtyWaste: 20, unit: 'Sheets' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ qtyProduced: 1000 }]);
    qcFindMany.mockResolvedValue([]);

    const summary = await getSignOffSummary('ph-2');

    expect(summary.output).toBe(980);
    expect(summary.waste).toBe(20);
    expect(summary.handedOver).toEqual({ processName: 'Printing', output: 1000 });
    expect(summary.wastePercent).toBeCloseTo(2);
  });
});
