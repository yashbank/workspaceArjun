/** R2-46 — COA / job-card versions with a two-level sign-off (prepared -> approved). Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
// R2-46 follow-up: issue/approve now capture the document's data (covered in r2-doc-version-snapshot.test.ts).
// R2-159: the approval guard reads the order status and QC checks from this fresh capture; `captured` is what a test sets.
const captured: { status: string; qcLogs: Row[] } = { status: 'COMPLETED', qcLogs: [] };
vi.mock('@/server/mis/document-snapshots', () => ({
  captureDocumentSnapshot: async (docType: string) => ({ kind: docType, schema: 1, capturedAt: new Date().toISOString(), order: { status: captured.status }, qcLogs: captured.qcLogs }),
}));

const rows: Row[] = [];
vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findUnique: async ({ where }: Row) => (where.id === 'o1' ? { id: 'o1' } : null) },
    misDocumentVersion: {
      findMany: async ({ where }: Row) =>
        rows.filter((r) => r.docType === where.docType && r.refId === where.refId).sort((a, b) => b.version - a.version),
      findUnique: async ({ where }: Row) => rows.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: Row) => {
        if (rows.some((r) => r.docType === data.docType && r.refId === data.refId && r.version === data.version)) throw new Error('unique');
        const rec = { id: `v${rows.length + 1}`, preparedAt: new Date(), approvedById: null, approvedAt: null, ...data };
        rows.push(rec);
        return rec;
      },
      updateMany: async ({ where, data }: Row) => {
        const hit = rows.filter((r) => r.id === where.id && r.status === where.status);
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
    userProfile: { findMany: async ({ where }: Row) => where.id.in.map((id: string) => ({ id, name: `Name ${id}` })) },
  },
}));

const { prepareDocumentVersion, approveDocumentVersion, voidDocumentVersion, getDocumentVersionView } = await import('./document-versions');

const as = (role: string, id: string) => {
  getCurrentUser.mockResolvedValue({ id });
  getMisRole.mockResolvedValue(role);
};

beforeEach(() => {
  rows.length = 0;
  captured.status = 'COMPLETED';
  captured.qcLogs = [];
  audit.mockClear();
});

describe('prepare (first level)', () => {
  it('numbers versions V1, V2, … per document and audits each', async () => {
    as('QC', 'qc1');
    const first = await prepareDocumentVersion('COA', 'o1');
    expect(first.version).toBe(1);
    // R2-156: V2 can only follow once V1 is approved (one pending version at a time).
    as('ADMIN', 'adm');
    await approveDocumentVersion(first.id);
    as('QC', 'qc1');
    expect((await prepareDocumentVersion('COA', 'o1', 'reprint after recheck')).version).toBe(2);
    as('SUPERVISOR', 'sup');
    expect((await prepareDocumentVersion('JOB_CARD', 'o1')).version).toBe(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOC_VERSION_PREPARE', after: expect.objectContaining({ docType: 'COA', version: 2, status: 'PREPARED' }) }));
  });
  it('a COA needs qc.write; a job card needs production.write', async () => {
    as('QC', 'qc1');
    await expect(prepareDocumentVersion('JOB_CARD', 'o1')).rejects.toMatchObject({ name: 'MisForbiddenError' });
    as('STORE_GUY', 's');
    await expect(prepareDocumentVersion('COA', 'o1')).rejects.toMatchObject({ name: 'MisForbiddenError' });
    as('WORKER', 'w');
    await expect(prepareDocumentVersion('JOB_CARD', 'o1')).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
  it('an unknown order or type is refused', async () => {
    as('OWNER', 'own');
    await expect(prepareDocumentVersion('COA', 'nope')).rejects.toThrow('Order not found.');
    await expect(prepareDocumentVersion('INVOICE' as never, 'o1')).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});

describe('approve (second level)', () => {
  it('an Admin approves a version someone else prepared; it then reads Approved', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    as('ADMIN', 'adm');
    await approveDocumentVersion(v1.id);
    const view = await getDocumentVersionView('COA', 'o1');
    expect(view.latest).toMatchObject({ version: 1, status: 'APPROVED', approvedByName: 'Name adm', preparedByName: 'Name qc1', canApprove: false });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOC_VERSION_APPROVE', entityId: v1.id }));
  });
  it('R2-155: the Owner MAY approve a version they prepared themselves (audited as self-approved)', async () => {
    as('OWNER', 'own');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    expect((await getDocumentVersionView('COA', 'o1')).latest?.canApprove).toBe(true);
    await approveDocumentVersion(v1.id);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOC_VERSION_APPROVE', entityId: v1.id, after: expect.objectContaining({ selfApproved: true }) }));
  });
  it('R2-155: an Admin still cannot approve their own version', async () => {
    as('ADMIN', 'adm');
    const v1 = await prepareDocumentVersion('JOB_CARD', 'o1');
    await expect(approveDocumentVersion(v1.id)).rejects.toThrow('A second person must approve: you prepared this version.');
    expect((await getDocumentVersionView('JOB_CARD', 'o1')).latest?.canApprove).toBe(false);
  });
  it('twice is refused', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    as('OWNER', 'own');
    await approveDocumentVersion(v1.id);
    await expect(approveDocumentVersion(v1.id)).rejects.toThrow(/already approved/);
  });
  it.each(['SUPERVISOR', 'QC', 'STORE_GUY', 'WORKER'])('%s cannot approve (approvals.read: Admin/Owner only)', async (role) => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    as(role, 'someone');
    await expect(approveDocumentVersion(v1.id)).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});

describe('R2-156 / R2-157 — one pending version, newest only', () => {
  it('R2-156: issuing V2 while V1 is still PREPARED is refused in words', async () => {
    as('QC', 'qc1');
    await prepareDocumentVersion('COA', 'o1');
    await expect(prepareDocumentVersion('COA', 'o1')).rejects.toThrow(/V1 is still waiting for approval/);
    expect(rows).toHaveLength(1);
  });
  it('R2-156: after V1 is approved, V2 can be issued', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    as('ADMIN', 'adm');
    await approveDocumentVersion(v1.id);
    as('QC', 'qc1');
    expect((await prepareDocumentVersion('COA', 'o1')).version).toBe(2);
  });
  it('R2-157: an older PREPARED version cannot be approved once a newer one exists', async () => {
    rows.push({ id: 'a', docType: 'COA', refId: 'o1', version: 1, status: 'PREPARED', preparedById: 'qc1', preparedAt: new Date(), approvedById: null, approvedAt: null, notes: null });
    rows.push({ id: 'b', docType: 'COA', refId: 'o1', version: 2, status: 'PREPARED', preparedById: 'qc1', preparedAt: new Date(), approvedById: null, approvedAt: null, notes: null });
    as('ADMIN', 'adm');
    await expect(approveDocumentVersion('a')).rejects.toThrow(/Only the newest version \(V2\) can be approved/);
    expect(rows[0].status).toBe('PREPARED');
    await approveDocumentVersion('b');
  });
});

describe('R2-159 — a COA is not approved for an unfinished order or an unresolved QC failure', () => {
  const chk = (result: string, checkTime: string) => ({ bomStageId: null, parameterName: 'Shade', result, checkTime });
  it.each(['CONFIRMED', 'IN_PRODUCTION'])('refuses a COA for an order that is %s, in words, and leaves it PREPARED', async (status) => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    captured.status = status;
    as('ADMIN', 'adm');
    await expect(approveDocumentVersion(v1.id)).rejects.toThrow(/order is not finished/i);
    expect(rows[0].status).toBe('PREPARED');
  });
  it('refuses a COA when a QC check still has result FAIL', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    captured.qcLogs = [chk('PASS', '2026-10-19T04:00:00Z'), { ...chk('FAIL', '2026-10-19T05:00:00Z'), parameterName: 'Tear' }];
    as('ADMIN', 'adm');
    await expect(approveDocumentVersion(v1.id)).rejects.toThrow(/failed quality check/i);
    expect(rows[0].status).toBe('PREPARED');
  });
  it('allows a COA when the failure was re-inspected and passed, for a DELIVERED order', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    captured.status = 'DELIVERED';
    captured.qcLogs = [chk('FAIL', '2026-10-19T04:00:00Z'), chk('PASS', '2026-10-19T05:00:00Z')];
    as('ADMIN', 'adm');
    await approveDocumentVersion(v1.id);
    expect(rows[0].status).toBe('APPROVED');
  });
  it('does not apply to a job card', async () => {
    as('SUPERVISOR', 'sup');
    const v1 = await prepareDocumentVersion('JOB_CARD', 'o1');
    captured.status = 'IN_PRODUCTION';
    captured.qcLogs = [chk('FAIL', '2026-10-19T04:00:00Z')];
    as('ADMIN', 'adm');
    await approveDocumentVersion(v1.id);
    expect(rows[0].status).toBe('APPROVED');
  });
});

describe('R2-158 — discard (void) a PREPARED version', () => {
  it('the preparer voids their own draft with a reason; the row stays, is audited, and the next issue skips the number', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    expect((await getDocumentVersionView('COA', 'o1')).versions[0].canVoid).toBe(true);
    await voidDocumentVersion(v1.id, 'issued by mistake');
    expect(rows[0]).toMatchObject({ id: v1.id, status: 'VOID' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOC_VERSION_VOID', entityId: v1.id, after: expect.objectContaining({ status: 'VOID', reason: 'issued by mistake' }) }));
    const view = await getDocumentVersionView('COA', 'o1');
    expect(view.latest).toBeNull();
    expect((await prepareDocumentVersion('COA', 'o1')).version).toBe(2);
  });
  it('an Admin or Owner may void someone else\'s draft; another QC may not', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    as('SUPERVISOR', 'sup');
    await expect(voidDocumentVersion(v1.id, 'x')).rejects.toMatchObject({ name: 'MisForbiddenError' });
    as('ADMIN', 'adm');
    await voidDocumentVersion(v1.id, 'wrong data');
    expect(rows[0].status).toBe('VOID');
  });
  it('needs a reason, and only a PREPARED version can be voided', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    await expect(voidDocumentVersion(v1.id, '  ')).rejects.toThrow(/reason/i);
    as('ADMIN', 'adm');
    await approveDocumentVersion(v1.id);
    await expect(voidDocumentVersion(v1.id, 'oops')).rejects.toThrow(/Only a version still waiting for approval/);
  });
  it('a voided version cannot be approved', async () => {
    as('QC', 'qc1');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    await voidDocumentVersion(v1.id, 'oops');
    as('ADMIN', 'adm');
    await expect(approveDocumentVersion(v1.id)).rejects.toThrow(/discarded/);
  });
});

describe('view', () => {
  it('lists newest first and says who may prepare / approve', async () => {
    as('QC', 'qc1');
    // R2-156/157: a second PREPARED version cannot be issued through the server, so seed the older rows directly.
    rows.push({ id: 'old1', docType: 'COA', refId: 'o1', version: 1, status: 'PREPARED', preparedById: 'qc1', preparedAt: new Date(), approvedById: null, approvedAt: null, notes: null });
    rows.push({ id: 'new2', docType: 'COA', refId: 'o1', version: 2, status: 'PREPARED', preparedById: 'qc1', preparedAt: new Date(), approvedById: null, approvedAt: null, notes: null });
    expect((await getDocumentVersionView('COA', 'o1')).canPrepare).toBe(true);
    as('ADMIN', 'adm');
    const view = await getDocumentVersionView('COA', 'o1');
    expect(view.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(view.versions.map((v) => v.canApprove)).toEqual([true, false]); // R2-157: only the newest
    as('SUPERVISOR', 'sup');
    expect((await getDocumentVersionView('COA', 'o1')).canPrepare).toBe(true); // supervisor holds qc.write
    expect((await getDocumentVersionView('JOB_CARD', 'o1')).latest).toBeNull();
  });
  it.each(['ATTENDANCE_OPERATOR', 'WORKER'])('%s cannot read (orders.read)', async (role) => {
    as(role, 'x');
    await expect(getDocumentVersionView('COA', 'o1')).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});
