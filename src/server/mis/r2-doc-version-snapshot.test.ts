/**
 * R2-46 follow-up — an APPROVED COA / job-card version is a frozen snapshot; "Update to latest"
 * issues V(n+1) from live data (Admin/Owner only). Db-free: the live reads are mocked with mutable
 * data so the real snapshot capture runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

// Live data the print pages read — mutated by tests to prove the frozen copy does not move.
const live: Row = {};
const resetLive = () => {
  live.order = { id: 'o1', orderNumber: 'ORD-101', status: 'COMPLETED', description: 'Duplex carton', deliveryDate: null, notes: null, customer: { name: 'Acme' } };
  live.qc = [{ id: 'c1', bomStageId: null, parameterName: 'Shade', result: 'PASS', defectType: null, notes: null, checkTime: new Date('2026-10-19T04:30:00Z'), checkBy: { name: 'Q One' } }];
  live.bom = { stages: [{ id: 's1', stageName: 'Print', process: { name: 'Offset' }, materials: [{ id: 'm1', description: 'Board', quantity: '120.5', unit: 'KG', rate: 99, ratePerUnit: 99 }] }] };
  live.production = { totalProduced: 500, totalWaste: 5, entries: 2, byUnit: [{ unit: 'PIECE', produced: 500, waste: 5, wastePercent: 1 }] };
  live.phases = [{ id: 'p1', sequence: 1, status: 'SIGNED_OFF', process: { name: 'Printing' }, inCharge: { name: 'Ravi' }, startedAt: new Date('2026-10-18T03:00:00Z'), signedOffAt: new Date('2026-10-18T09:00:00Z'), notApplicableReason: null, downstreamFlagged: false }];
  live.crew = [{ jobPhaseId: 'p1', phaseName: 'Printing', machineName: 'Press 1', dateKey: '2026-10-18', shiftName: 'Day', people: [{ name: 'Asha', employeeCode: 'E1', released: false }] }];
};
vi.mock('@/server/mis/orders', () => ({ getOrder: async (id: string) => (id === 'o1' ? structuredClone(live.order) : null) }));
vi.mock('@/server/mis/qc', () => ({ getQcForOrder: async () => structuredClone(live.qc) }));
vi.mock('@/server/mis/bom', () => ({ getBom: async () => structuredClone(live.bom) }));
vi.mock('@/server/mis/production', () => ({ getProductionSummary: async () => structuredClone(live.production) }));
vi.mock('@/server/mis/job-phases', () => ({ getPhasesForOrder: async () => structuredClone(live.phases) }));
vi.mock('@/server/mis/worker-allocation', () => ({ getCrewForOrder: async () => structuredClone(live.crew) }));

const rows: Row[] = [];
vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findUnique: async ({ where }: Row) => (where.id === 'o1' ? { id: 'o1' } : null) },
    misDocumentVersion: {
      findMany: async ({ where }: Row) =>
        rows.filter((r) => r.docType === where.docType && r.refId === where.refId).sort((a, b) => b.version - a.version),
      findUnique: async ({ where }: Row) => rows.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: Row) => {
        if (rows.some((r) => r.docType === data.docType && r.refId === data.refId && r.version === data.version)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        const rec = { id: `v${rows.length + 1}`, preparedAt: new Date(), approvedById: null, approvedAt: null, snapshot: null, ...structuredClone(data) };
        rows.push(rec);
        return rec;
      },
      updateMany: async ({ where, data }: Row) => {
        const hit = rows.filter((r) => r.id === where.id && r.status === where.status);
        hit.forEach((r) => Object.assign(r, structuredClone(data)));
        return { count: hit.length };
      },
    },
    userProfile: { findMany: async ({ where }: Row) => where.id.in.map((id: string) => ({ id, name: `Name ${id}` })) },
  },
}));

const { prepareDocumentVersion, approveDocumentVersion, updateDocumentVersionToLatest, getDocumentVersionView, getDocumentVersionSnapshot } =
  await import('./document-versions');

const as = (role: string, id: string) => {
  getCurrentUser.mockResolvedValue({ id });
  getMisRole.mockResolvedValue(role);
};

/** QC issues V1 of the COA, an Admin approves it. */
async function approvedCoaV1() {
  as('QC', 'qc1');
  const v1 = await prepareDocumentVersion('COA', 'o1');
  as('ADMIN', 'adm');
  await approveDocumentVersion(v1.id);
  return v1;
}

beforeEach(() => {
  rows.length = 0;
  audit.mockClear();
  resetLive();
});

describe('snapshot capture', () => {
  it('issuing a COA stores the rendered data (order + QC checks)', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    expect(rows[0].snapshot).toMatchObject({
      kind: 'COA',
      order: { orderNumber: 'ORD-101', customerName: 'Acme', status: 'COMPLETED' },
      qcLogs: [{ parameterName: 'Shade', result: 'PASS', checkByName: 'Q One', checkTime: '2026-10-19T04:30:00.000Z' }],
    });
    expect((await getDocumentVersionView('COA', 'o1')).versions[0]).toMatchObject({ id: v1.id, hasSnapshot: true });
  });

  it('a job-card snapshot holds BOM, phases, crew and per-unit totals, and never a rate', async () => {
    as('SUPERVISOR', 'sup');
    await prepareDocumentVersion('JOB_CARD', 'o1');
    const snap = rows[0].snapshot;
    expect(snap).toMatchObject({
      kind: 'JOB_CARD',
      bomStages: [{ stageName: 'Print', processName: 'Offset', materials: [{ description: 'Board', quantity: 120.5, unit: 'KG' }] }],
      production: { entries: 2, byUnit: [{ unit: 'PIECE', produced: 500, waste: 5 }] },
      phases: [{ processName: 'Printing', inChargeName: 'Ravi', status: 'SIGNED_OFF', signedOffAt: '2026-10-18T09:00:00.000Z' }],
      crew: [{ machineName: 'Press 1', people: [{ name: 'Asha', employeeCode: 'E1', released: false }] }],
    });
    expect(JSON.stringify(snap)).not.toMatch(/rate/i);
  });

  it('approval re-captures what the approver saw and records whether the data moved since issue', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    // R2-159: a COA can no longer be approved over a FAIL, so the moved data here is a QC note, not a result.
    live.qc[0].notes = 'rechecked after issue';
    as('OWNER', 'own');
    await approveDocumentVersion(v1.id);
    expect(rows[0].snapshot.qcLogs[0].notes).toBe('rechecked after issue');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOC_VERSION_APPROVE', after: expect.objectContaining({ changedSinceIssued: true }) }));
  });
});

describe('an approved version is frozen', () => {
  it('its snapshot does not change when order / QC data change later', async () => {
    const v1 = await approvedCoaV1();
    const before = structuredClone(await getDocumentVersionSnapshot('COA', 'o1', v1.id));
    live.order.description = 'Changed after approval';
    live.order.status = 'DELIVERED';
    live.qc.push({ id: 'c2', bomStageId: null, parameterName: 'Tear', result: 'FAIL', defectType: 'TEAR', notes: 'late', checkTime: new Date(), checkBy: { name: 'Q Two' } });
    // A second approval attempt (any approver) is refused and does not touch it.
    as('OWNER', 'own');
    await expect(approveDocumentVersion(v1.id)).rejects.toThrow(/already approved/);
    const after = await getDocumentVersionSnapshot('COA', 'o1', v1.id);
    expect(after).toEqual(before);
    expect(after?.order.description).toBe('Duplex carton');
    expect(after && 'qcLogs' in after ? after.qcLogs : []).toHaveLength(1);
  });

  it('a corrupt stored copy throws rather than printing; a wrong order/type is refused', async () => {
    const v1 = await approvedCoaV1();
    await expect(getDocumentVersionSnapshot('JOB_CARD', 'o1', v1.id)).rejects.toThrow(/no longer exists/);
    rows[0].snapshot = { kind: 'COA' };
    await expect(getDocumentVersionSnapshot('COA', 'o1', v1.id)).rejects.toThrow(/cannot be read/);
  });

  it.each(['ATTENDANCE_OPERATOR', 'WORKER'])('%s cannot read a snapshot (orders.read)', async (role) => {
    const v1 = await approvedCoaV1();
    as(role, 'x');
    await expect(getDocumentVersionSnapshot('COA', 'o1', v1.id)).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});

describe('Update to latest', () => {
  it('an Admin issues V2 (PREPARED) from live data; it needs a second approver; V1 stays frozen and listed', async () => {
    const v1 = await approvedCoaV1();
    live.order.description = 'Revised spec';
    as('ADMIN', 'adm');
    expect((await getDocumentVersionView('COA', 'o1')).canUpdateToLatest).toBe(true);
    const v2 = await updateDocumentVersionToLatest(v1.id);
    expect(v2).toMatchObject({ version: 2, status: 'PREPARED', preparedById: 'adm', notes: 'Updated to latest from V1' });
    expect(rows.find((r) => r.id === v2.id)?.snapshot.order.description).toBe('Revised spec');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DOC_VERSION_UPDATE_TO_LATEST', entityId: v2.id, before: expect.objectContaining({ version: 1, hadSnapshot: true }) }),
    );
    // The issuer is the preparer: they cannot approve it themselves (existing rule).
    await expect(approveDocumentVersion(v2.id)).rejects.toThrow('A second person must approve: you prepared this version.');
    const view = await getDocumentVersionView('COA', 'o1');
    expect(view.versions.map((v) => [v.version, v.status])).toEqual([[2, 'PREPARED'], [1, 'APPROVED']]);
    expect(view.canUpdateToLatest).toBe(false); // newest is PREPARED now
    as('OWNER', 'own');
    await approveDocumentVersion(v2.id);
    expect((await getDocumentVersionSnapshot('COA', 'o1', v1.id))?.order.description).toBe('Duplex carton');
    expect((await getDocumentVersionSnapshot('COA', 'o1', v2.id))?.order.description).toBe('Revised spec');
  });

  it.each(['SUPERVISOR', 'QC', 'STORE_GUY', 'WORKER', 'ATTENDANCE_OPERATOR'])('%s is refused (Admin/Owner only) and nothing is issued', async (role) => {
    const v1 = await approvedCoaV1();
    as(role, 'someone');
    await expect(updateDocumentVersionToLatest(v1.id)).rejects.toMatchObject({ name: 'MisForbiddenError' });
    expect(rows).toHaveLength(1);
    if (role !== 'WORKER' && role !== 'ATTENDANCE_OPERATOR') expect((await getDocumentVersionView('COA', 'o1')).canUpdateToLatest).toBe(false);
  });

  it('only the newest APPROVED version can be updated', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    as('OWNER', 'own');
    await expect(updateDocumentVersionToLatest(v1.id)).rejects.toThrow('Only an approved version can be updated to latest.');
    await approveDocumentVersion(v1.id);
    await updateDocumentVersionToLatest(v1.id);
    await expect(updateDocumentVersionToLatest(v1.id)).rejects.toThrow('V2 is already issued — open it instead.');
    await expect(updateDocumentVersionToLatest('missing')).rejects.toThrow(/no longer exists/);
  });

  it('two Admins updating at once mint ONE V2; the loser is refused in words (unique index, P2002)', async () => {
    const v1 = await approvedCoaV1();
    as('ADMIN', 'adm');
    const results = await Promise.allSettled([updateDocumentVersionToLatest(v1.id), updateDocumentVersionToLatest(v1.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(lost.reason?.message)).toMatch(/V2 was just issued by someone else/);
    expect(rows.map((r) => r.version).sort()).toEqual([1, 2]);
  });

  it('two concurrent first issues mint ONE V1', async () => {
    as('QC', 'qc1');
    const results = await Promise.allSettled([prepareDocumentVersion('COA', 'o1'), prepareDocumentVersion('COA', 'o1')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  it('a legacy approved row (no snapshot) reads hasSnapshot=false; Update to latest issues a version WITH a snapshot', async () => {
    rows.push({ id: 'legacy', docType: 'JOB_CARD', refId: 'o1', version: 1, status: 'APPROVED', preparedById: 'sup', preparedAt: new Date(), approvedById: 'own', approvedAt: new Date(), notes: null, snapshot: null });
    as('ADMIN', 'adm');
    const view = await getDocumentVersionView('JOB_CARD', 'o1');
    expect(view.latest).toMatchObject({ status: 'APPROVED', hasSnapshot: false });
    expect(view.canUpdateToLatest).toBe(true);
    expect(await getDocumentVersionSnapshot('JOB_CARD', 'o1', 'legacy')).toBeNull();
    const v2 = await updateDocumentVersionToLatest('legacy');
    expect(rows.find((r) => r.id === v2.id)?.snapshot).toMatchObject({ kind: 'JOB_CARD', order: { orderNumber: 'ORD-101' } });
    expect(rows.find((r) => r.id === 'legacy')?.snapshot).toBeNull();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOC_VERSION_UPDATE_TO_LATEST', before: expect.objectContaining({ hadSnapshot: false }) }));
  });
});
