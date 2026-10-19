/** R2-46 — COA / job-card versions with a two-level sign-off (prepared -> approved). Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

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

const { prepareDocumentVersion, approveDocumentVersion, getDocumentVersionView } = await import('./document-versions');

const as = (role: string, id: string) => {
  getCurrentUser.mockResolvedValue({ id });
  getMisRole.mockResolvedValue(role);
};

beforeEach(() => {
  rows.length = 0;
  audit.mockClear();
});

describe('prepare (first level)', () => {
  it('numbers versions V1, V2, … per document and audits each', async () => {
    as('QC', 'qc1');
    expect((await prepareDocumentVersion('COA', 'o1')).version).toBe(1);
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
  it('the preparer cannot approve their own version, even as Owner', async () => {
    as('OWNER', 'own');
    const v1 = await prepareDocumentVersion('COA', 'o1');
    await expect(approveDocumentVersion(v1.id)).rejects.toThrow('A second person must approve: you prepared this version.');
    expect((await getDocumentVersionView('COA', 'o1')).latest?.canApprove).toBe(false);
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

describe('view', () => {
  it('lists newest first and says who may prepare / approve', async () => {
    as('QC', 'qc1');
    await prepareDocumentVersion('COA', 'o1');
    await prepareDocumentVersion('COA', 'o1');
    expect((await getDocumentVersionView('COA', 'o1')).canPrepare).toBe(true);
    as('ADMIN', 'adm');
    const view = await getDocumentVersionView('COA', 'o1');
    expect(view.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(view.versions.every((v) => v.canApprove)).toBe(true);
    as('SUPERVISOR', 'sup');
    expect((await getDocumentVersionView('COA', 'o1')).canPrepare).toBe(true); // supervisor holds qc.write
    expect((await getDocumentVersionView('JOB_CARD', 'o1')).latest).toBeNull();
  });
  it.each(['ATTENDANCE_OPERATOR', 'WORKER'])('%s cannot read (orders.read)', async (role) => {
    as(role, 'x');
    await expect(getDocumentVersionView('COA', 'o1')).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});
