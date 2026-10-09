/**
 * V2 Epic 3 — a Material Issue Note moves stock only on approval, never more than asked, and
 * refuses equipment/other against an order.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state: { request: Row | null; lineUpdates: Row[]; headerUpdates: Row[]; created: Row | null } = {
  request: null, lineUpdates: [], headerUpdates: [], created: null,
};
const items = [
  { id: 'i-kraft', name: 'Kraft', category: 'RAW_MATERIAL' },
  { id: 'i-die', name: 'Die', category: 'EQUIPMENT' },
];

vi.mock('@/server/db', () => ({
  db: {
    misItem: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => items.filter((i) => where.id.in.includes(i.id)) },
    misMaterialRequest: {
      create: async ({ data }: { data: Row }) => { state.created = data; return { id: 'r1', ...data }; },
      findUnique: async () => state.request,
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const matches = state.request && state.request.status === where.status;
        if (matches) { state.request = { ...state.request!, ...data }; state.headerUpdates.push(data); }
        return { count: matches ? 1 : 0 };
      },
    },
    misMaterialRequestLine: { update: async (args: Row) => { state.lineUpdates.push(args); return args; } },
    misOrder: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'o1' ? { id: 'o1' } : null) },
    misDepartment: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'd1' ? { id: 'd1' } : null) },
  },
}));
const commitIssue = vi.fn();
vi.mock('./store', () => ({ commitIssue: (...a: unknown[]) => commitIssue(...a) }));
vi.mock('./audit', () => ({ logAuditEvent: async () => undefined }));
const notifyRoles = vi.fn();
const notifyUser = vi.fn();
vi.mock('./notifications', () => ({ notifyRoles: (...a: unknown[]) => notifyRoles(...a), notifyUser: (...a: unknown[]) => notifyUser(...a) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { approveMaterialRequest, createMaterialRequest, rejectMaterialRequest } = await import('./material-request');

const dec = (n: number) => ({ toNumber: () => n });
const pending = () => ({
  id: 'r1', requestNumber: 'MRN-1', status: 'PENDING', orderId: 'o1', departmentId: null, requestedById: 'sup-9',
  lines: [
    { id: 'l1', itemId: 'i-kraft', requestedQty: dec(10) },
    { id: 'l2', itemId: 'i-kraft2', requestedQty: dec(5) },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { request: pending(), lineUpdates: [], headerUpdates: [], created: null });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('STORE_GUY');
  commitIssue.mockResolvedValue({ reference: 'ORD-1', lineCount: 1, totalQty: 7 });
});

describe('create', () => {
  it('a SUPERVISOR may raise a note (store.read), and nothing touches the ledger', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    await createMaterialRequest([{ itemId: 'i-kraft', qty: 3 }], { orderId: 'o1' });
    expect(state.created).toMatchObject({ orderId: 'o1', requestedById: 'u1' });
    expect(commitIssue).not.toHaveBeenCalled();
    expect(notifyRoles).toHaveBeenCalledWith(['STORE_GUY'], 'mis.material_request.raised', expect.objectContaining({ requestNumber: expect.stringMatching(/^MRN-/), lineCount: 1 }));
  });

  it('equipment cannot be booked to an order, but can be requested as overhead', async () => {
    await expect(createMaterialRequest([{ itemId: 'i-die', qty: 1 }], { orderId: 'o1' })).rejects.toThrow(/Die/);
    await expect(createMaterialRequest([{ itemId: 'i-die', qty: 1 }], { departmentId: 'd1' })).resolves.toBeTruthy();
  });

  it('a stale order id is a message, not a foreign-key error', async () => {
    await expect(createMaterialRequest([{ itemId: 'i-kraft', qty: 1 }], { orderId: 'gone' })).rejects.toThrow(/no longer exists/);
  });

  it('a QC role is refused', async () => {
    getMisRole.mockResolvedValue('QC');
    await expect(createMaterialRequest([{ itemId: 'i-kraft', qty: 1 }])).rejects.toThrow(/Not permitted/);
  });
});

describe('approve', () => {
  it('issues the capped quantities through commitIssue and records each line', async () => {
    await approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 7 }, { lineId: 'l2', actualIssuedQty: 0 }]);
    expect(commitIssue).toHaveBeenCalledWith([{ itemId: 'i-kraft', qty: 7 }], expect.objectContaining({ orderId: 'o1' }));
    expect(state.request?.status).toBe('APPROVED');
    expect(state.lineUpdates.map((u) => (u as { data: Row }).data.actualIssuedQty)).toEqual([7, 0]);
    expect(notifyUser).toHaveBeenCalledWith('sup-9', 'mis.material_request.decided', expect.objectContaining({ status: 'APPROVED' }));
  });

  it('refuses one unit over the requested qty, before any stock moves', async () => {
    await expect(approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 10.01 }])).rejects.toThrow(/only 10 was requested/);
    expect(commitIssue).not.toHaveBeenCalled();
    expect(state.request?.status).toBe('PENDING');
  });

  it('a SUPERVISOR cannot approve (store.write)', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 1 }])).rejects.toThrow(/Not permitted/);
  });

  it('a note already decided cannot be approved again, so stock never leaves twice', async () => {
    state.request = { ...pending(), status: 'APPROVED' };
    await expect(approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 1 }])).rejects.toThrow(/already APPROVED/);
    expect(commitIssue).not.toHaveBeenCalled();
  });

  it('once stock has moved, a later failure (line write) does NOT re-open the note — no double issue', async () => {
    const lineUpdate = vi.spyOn((await import('@/server/db')).db.misMaterialRequestLine, 'update').mockRejectedValueOnce(new Error('connection reset'));
    await expect(approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 5 }])).rejects.toThrow(/connection reset/);
    expect(state.request?.status).toBe('APPROVED');
    lineUpdate.mockRestore();
  });

  it('a failed issue puts the note back to PENDING', async () => {
    commitIssue.mockRejectedValue(new Error('Cannot issue more than the stock balance'));
    await expect(approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 5 }])).rejects.toThrow(/stock balance/);
    expect(state.request?.status).toBe('PENDING');
  });
});

describe('reject', () => {
  it('needs a reason and flips the status', async () => {
    await expect(rejectMaterialRequest('r1', ' ')).rejects.toThrow(/reason/);
    await rejectMaterialRequest('r1', 'Not on BOM');
    expect(state.request?.status).toBe('REJECTED');
  });
});
