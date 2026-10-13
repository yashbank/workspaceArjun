/**
 * F2 — material issue notes: the category / order-status rules at request time, 2 dp rounding
 * before validation, and the line quantities committing on the SAME transaction as the stock
 * movement (a crash can no longer leave an APPROVED note with no issued quantities).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
const state: { request: Row | null; created: Row | null; order: Row | null; txLineWrites: Row[]; dbLineWrites: Row[] } = {
  request: null, created: null, order: null, txLineWrites: [], dbLineWrites: [],
};
const items = [
  { id: 'i-kraft', name: 'Kraft', category: 'RAW_MATERIAL' },
  { id: 'i-die', name: 'Die', category: 'EQUIPMENT' },
  { id: 'i-broom', name: 'Broom', category: 'OTHER' },
];

vi.mock('@/server/db', () => ({
  db: {
    misItem: { findMany: async ({ where }: Row) => items.filter((i) => where.id.in.includes(i.id)) },
    misMaterialRequest: {
      create: async ({ data }: Row) => { state.created = data; return { id: 'r1', ...data }; },
      findUnique: async () => state.request,
      updateMany: async ({ where, data }: Row) => {
        const matches = state.request && state.request.status === where.status;
        if (matches) state.request = { ...state.request!, ...data };
        return { count: matches ? 1 : 0 };
      },
    },
    misMaterialRequestLine: { update: async (args: Row) => { state.dbLineWrites.push(args); return args; } },
    misOrder: { findUnique: async () => state.order },
    misDepartment: { findUnique: async ({ where }: Row) => (where.id === 'd1' ? { id: 'd1', name: 'Press' } : null) },
  },
}));
// R3-STK B20: the PENDING -> APPROVED claim now runs on the issue's transaction client. Its write is staged and only
// lands on `state.request` when the (mocked) issue commits, so a failed issue claims nothing.
const staged: { request: Row | null } = { request: null };
const claim = async ({ where, data }: Row) => {
  const matches = state.request && state.request.status === where.status;
  if (matches) staged.request = { ...state.request!, ...data };
  return { count: matches ? 1 : 0 };
};
const txClient = { misMaterialRequest: { updateMany: claim }, misMaterialRequestLine: { update: async (args: Row) => { state.txLineWrites.push(args); return args; } } };
const commitIssue = vi.fn();
vi.mock('./store', () => ({ commitIssue: (...a: unknown[]) => commitIssue(...a) }));
vi.mock('./audit', () => ({ logAuditEvent: async () => undefined }));
vi.mock('./notifications', () => ({ notifyRoles: async () => undefined }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { approveMaterialRequest, createMaterialRequest } = await import('./material-request');

const dec = (n: number) => ({ toNumber: () => n });
const pending = () => ({
  id: 'r1', requestNumber: 'MRN-1', status: 'PENDING', orderId: 'o1', departmentId: null,
  lines: [{ id: 'l1', itemId: 'i-kraft', requestedQty: dec(10) }, { id: 'l2', itemId: 'i-kraft2', requestedQty: dec(5) }],
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    request: pending(), created: null, txLineWrites: [], dbLineWrites: [],
    order: { id: 'o1', orderNumber: 'ORD-202610-00001', status: 'IN_PRODUCTION' },
  });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('STORE_GUY');
  commitIssue.mockImplementation(async (_cart: unknown, meta: Row) => {
    staged.request = null;
    await meta.inTransaction?.(txClient);
    if (staged.request) state.request = staged.request;
    return { reference: 'ORD-1', lineCount: 1, totalQty: 7 };
  });
});

describe('F. category rule at request time (same rule commitIssue enforces)', () => {
  it('equipment AND other items are refused against an order', async () => {
    await expect(createMaterialRequest([{ itemId: 'i-die', qty: 1 }], { orderId: 'o1' })).rejects.toThrow(/Die/);
    await expect(createMaterialRequest([{ itemId: 'i-broom', qty: 1 }], { orderId: 'o1' })).rejects.toThrow(/Broom/);
  });

  it('equipment with neither an order nor a department is refused; with a department it is raised', async () => {
    await expect(createMaterialRequest([{ itemId: 'i-die', qty: 1 }], {})).rejects.toThrow(/must be issued to a department/);
    await expect(createMaterialRequest([{ itemId: 'i-die', qty: 1 }], { departmentId: 'd1' })).resolves.toBeTruthy();
  });

  it('raw material needs neither', async () => {
    await expect(createMaterialRequest([{ itemId: 'i-kraft', qty: 1 }], {})).resolves.toBeTruthy();
  });
});

describe('I. no request against a closed order', () => {
  it.each(['CANCELLED', 'COMPLETED', 'DELIVERED'])('%s is refused', async (status) => {
    state.order = { id: 'o1', orderNumber: 'ORD-202610-00001', status };
    await expect(createMaterialRequest([{ itemId: 'i-kraft', qty: 1 }], { orderId: 'o1' })).rejects.toThrow(/closed order/);
    expect(state.created).toBeNull();
  });
});

describe('H. 2 dp rounding before validation', () => {
  it('a request for 0.004 is refused instead of being saved as 0.00; 2.499 is stored as 2.5', async () => {
    await expect(createMaterialRequest([{ itemId: 'i-kraft', qty: 0.004 }], {})).rejects.toThrow(/greater than zero/);
    await createMaterialRequest([{ itemId: 'i-kraft', qty: 2.499 }], {});
    expect((state.created!.lines as Row).create[0].requestedQty).toBe(2.5);
  });

  it('an approved quantity is capped on its stored figure: 10.004 of 10 is fine, 10.006 is not', async () => {
    await approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 10.004 }]);
    expect(state.txLineWrites.find((w) => w.where.id === 'l1')!.data.actualIssuedQty).toBe(10);
    state.request = pending();
    await expect(approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 10.006 }])).rejects.toThrow(/only 10 was requested/);
  });
});

describe('G. line quantities commit with the stock movement', () => {
  it('are written on the issue’s transaction, never on the bare client', async () => {
    await approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 7 }, { lineId: 'l2', actualIssuedQty: 0 }]);
    expect(state.txLineWrites.map((w) => w.data.actualIssuedQty)).toEqual([7, 0]);
    expect(state.dbLineWrites).toEqual([]);
  });

  it('a failed line write rolls the issue back, so the note goes back to PENDING (no APPROVED note without quantities)', async () => {
    commitIssue.mockImplementation(async (_cart: unknown, meta: Row) => {
      await meta.inTransaction?.({ misMaterialRequest: { updateMany: claim }, misMaterialRequestLine: { update: async () => { throw new Error('connection reset'); } } });
      return { reference: 'x', lineCount: 1, totalQty: 7 };
    });
    await expect(approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 5 }])).rejects.toThrow(/connection reset/);
    expect(state.request?.status).toBe('PENDING');
  });
});
