/**
 * R2 batch 2 — Store: Supervisor cannot issue (R2-38), General / factory use (R2-80/62/Q11), supervisor told of a
 * decision (R2-67), fresh balances (R2-66), Pick & Staging (R2-77), Return-to-Store (R2-79). db-free.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake

const state: {
  txns: Row[]; ledger: Row[]; notifications: Row[]; returns: Row[]; pickList: Row | null; pickLines: Row[]; request: Row | null; requestHeaderWrites: Row[];
  pickCreated: Row | null; issuedQty: number; requestLineWrites: Row[];
} = { issuedQty: 100, requestLineWrites: [], txns: [], ledger: [], notifications: [], returns: [], pickList: null, pickLines: [], request: null, requestHeaderWrites: [], pickCreated: null };

const db: Row = {
  misItem: {
    findFirst: async () => ({ id: 'i1', name: 'Grease', code: 'G1', sku: null, category: 'CONSUMABLE' }),
    findMany: async ({ where }: Row) => [{ id: 'i1', name: 'Grease', category: 'CONSUMABLE' }].filter((i) => where.id.in.includes(i.id)),
  },
  misOrder: { findUnique: async ({ where }: Row) => (where.id === 'o1' ? { id: 'o1', orderNumber: 'ORD-1', status: 'CONFIRMED' } : null) },
  misDepartment: { findUnique: async ({ where }: Row) => (where.id === 'd1' ? { id: 'd1', name: 'Press' } : null) },
  misOrderStockAllocation: { findMany: async () => [] },
  misInventoryLedger: { findMany: async () => [], aggregate: async () => ({ _sum: { changeQty: -state.issuedQty } }), create: async ({ data }: Row) => { state.ledger.push(data); return { id: `l${state.ledger.length}`, ...data }; } },
  misStoreTransaction: { create: async ({ data }: Row) => { state.txns.push(data); return { id: `t${state.txns.length}`, ...data, quantity: data.quantity, balanceQty: data.balanceQty, createdAt: new Date() }; } },
  notification: { create: async ({ data }: Row) => { state.notifications.push(data); return data; } },
  misMaterialRequest: {
    create: async ({ data }: Row) => { state.request = { id: 'r1', ...data }; return state.request; },
    findUnique: async () => state.request,
    updateMany: async ({ where, data }: Row) => {
      const ok = state.request && state.request.status === where.status;
      if (ok) { state.request = { ...state.request, ...data }; state.requestHeaderWrites.push(data); }
      return { count: ok ? 1 : 0 };
    },
  },
  misMaterialRequestLine: { update: async (args: Row) => { state.requestLineWrites.push(args); return {}; } },
  misPickList: {
    findMany: async () => [],
    create: async (args: Row) => { state.pickCreated = args.data; return { id: 'pl1', ...args.data }; },
    findUnique: async () => state.pickList,
    updateMany: async ({ where, data }: Row) => {
      const allowed = Array.isArray(where.status?.in) ? where.status.in : [where.status];
      const ok = state.pickList && allowed.includes(state.pickList.status);
      if (ok) state.pickList = { ...state.pickList, ...data };
      return { count: ok ? 1 : 0 };
    },
  },
  misPickListLine: { update: async ({ where, data }: Row) => { const l = state.pickLines.find((x) => x.id === where.id)!; Object.assign(l, data); return l; } },
  misStoreReturn: {
    findMany: async () => [],
    aggregate: async ({ where }: Row) => ({
      _sum: { quantity: state.returns.filter((r) => where.status.in.includes(r.status) && r.id !== where.id?.not).reduce((n, r) => n + Number(r.quantity), 0) },
    }),
    create: async ({ data }: Row) => { const row = { id: 'ret1', status: 'PENDING', ...data }; state.returns = [row]; return row; },
    findUnique: async () => (state.returns[0] ? { ...state.returns[0], quantity: { toNumber: () => Number(state.returns[0].quantity) }, item: { name: 'Grease' } } : null),
    updateMany: async ({ where, data }: Row) => {
      const r = state.returns[0];
      const ok = r && r.status === where.status;
      if (ok) Object.assign(r, data);
      return { count: ok ? 1 : 0 };
    },
    update: async ({ data }: Row) => { Object.assign(state.returns[0], data); return state.returns[0]; },
  },
  $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
};
vi.mock('@/server/db', () => ({ db }));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('./audit', () => ({ logAuditEvent: async () => undefined }));
const notifyRoles = vi.fn(async () => undefined);
vi.mock('./notifications', () => ({ notifyRoles: (...a: unknown[]) => (notifyRoles as (...x: unknown[]) => unknown)(...a) }));
vi.mock('./stock-lock', () => ({ lockStockKeys: async () => undefined }));
vi.mock('./store-books', () => ({
  lastLedgerBalance: async () => 100,
  lastTxnBalance: async () => 100,
  nextTxnSeq: async () => ({ prefix: 'STXN-20261019-', next: 1 }),
  nonNegativeQty: (n: number) => n,
  round2: (n: number) => Math.round(n * 100) / 100,
  storeFactoryZone: async () => 'Asia/Kolkata',
  STXN_SEQ_KEY: 'stxn-seq',
  txnNumberOf: (prefix: string, n: number) => `${prefix}${String(n).padStart(4, '0')}`,
  factoryDayStart: () => new Date(),
}));
const commitIssue = vi.fn(async (..._a: unknown[]) => ({ reference: 'ORD-1', lineCount: 1, totalQty: 4 }));
vi.mock('./store', async () => {
  const actual = await vi.importActual<typeof import('./store')>('./store');
  return { ...actual, commitIssue: (...a: unknown[]) => commitIssue(...a) };
});

const storeModule = await vi.importActual<typeof import('./store')>('./store');
const { createStoreOut, listItemBalances, listCostCenters } = storeModule;
const { createMaterialRequest, approveMaterialRequest, approveMaterialRequestForPicking, rejectMaterialRequest } = await import('./material-request');
const { recordPicks, stagePickList, handOverPickList, listPickLists } = await import('./pick-list');
const { createStoreReturn, decideStoreReturn, listStoreReturns } = await import('./store-return');

const G = { reason: 'grease for the plates', costCenter: 'Press' };
const dec = (n: number) => ({ toNumber: () => n });
const asRole = (role: string) => { getCurrentUser.mockResolvedValue({ id: `${role}-1` }); getMisRole.mockResolvedValue(role); };
const forbidden = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ name: 'MisForbiddenError' });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { txns: [], ledger: [], notifications: [], returns: [], pickList: null, pickLines: [], request: null, requestHeaderWrites: [], pickCreated: null, issuedQty: 100, requestLineWrites: [] });
  asRole('STORE_GUY');
});

describe('R2-38 — a Supervisor cannot issue, and is not given a 500', () => {
  it('createStoreOut, commitIssue-backed approvals and picking writes are refused with MisForbiddenError for a SUPERVISOR', async () => {
    asRole('SUPERVISOR');
    await forbidden(createStoreOut({ itemId: 'i1', quantity: 1, general: G }));
    await forbidden(approveMaterialRequest('r1', []));
    await forbidden(approveMaterialRequestForPicking('r1', []));
    await forbidden(rejectMaterialRequest('r1', 'no'));
    await forbidden(recordPicks('pl1', []));
    await forbidden(stagePickList('pl1'));
    await forbidden(handOverPickList('pl1'));
    await forbidden(decideStoreReturn('ret1', 'ACCEPT'));
  });
  it('but a SUPERVISOR may raise a request and read pick lists', async () => {
    asRole('SUPERVISOR');
    state.request = null;
    await expect(createMaterialRequest([{ itemId: 'i1', qty: 2 }], { orderId: 'o1' })).resolves.toBeTruthy();
    await expect(listPickLists()).resolves.toEqual([]);
  });
  it('a SUPERVISOR may read the returns list', async () => {
    asRole('SUPERVISOR');
    await expect(listStoreReturns()).resolves.toEqual([]);
  });
  it('QC and the attendance roles cannot even read the Store lists', async () => {
    for (const role of ['QC', 'ATTENDANCE_OPERATOR', 'WORKER']) {
      asRole(role);
      await forbidden(listItemBalances());
      await forbidden(listCostCenters());
      await forbidden(listStoreReturns());
      await forbidden(createStoreReturn({ itemId: 'i1', qty: 1, reason: 'unused' }));
    }
  });
});

describe('R2-80/62/Q11 — General / factory use', () => {
  it('an issue with neither order nor department nor general block is still refused as untraceable', async () => {
    await expect(createStoreOut({ itemId: 'i1', quantity: 1 })).rejects.toThrow(/Pick an order or a department/);
  });
  it('a department-only issue is no longer enough: it must be marked General with a reason and cost centre', async () => {
    await expect(createStoreOut({ itemId: 'i1', quantity: 1, departmentId: 'd1' })).rejects.toThrow(/General \/ factory use/);
    await expect(createStoreOut({ itemId: 'i1', quantity: 1, departmentId: 'd1', general: { reason: 'x', costCenter: 'Press' } })).rejects.toThrow(/reason/);
    await expect(createStoreOut({ itemId: 'i1', quantity: 1, departmentId: 'd1', general: { reason: 'grease', costCenter: '' } })).rejects.toThrow(/cost centre/);
    expect(state.txns).toHaveLength(0);
  });
  it('a complete General issue is tagged GENERAL on the store transaction and Owner + Admin are told', async () => {
    await createStoreOut({ itemId: 'i1', quantity: 2, general: G });
    expect(state.txns[0]).toMatchObject({ isGeneral: true, generalReason: 'grease for the plates', costCenter: 'Press', type: 'OUT' });
    expect(state.txns[0].reason).toContain('General / factory use');
    expect(notifyRoles).toHaveBeenCalledWith(['OWNER', 'ADMIN'], 'mis.general_use', expect.objectContaining({ kind: 'issue', costCenter: 'Press', reason: 'grease for the plates' }), 'STORE_GUY-1');
  });
  it('an order issue is not General and sends no General notice', async () => {
    await createStoreOut({ itemId: 'i1', quantity: 2, orderId: 'o1' });
    expect(state.txns[0]).toMatchObject({ isGeneral: false, generalReason: null, costCenter: null });
    expect(notifyRoles).not.toHaveBeenCalled();
  });
  it('a General request stores the tag and tells Owner + Admin when it is raised; an order request does not', async () => {
    asRole('SUPERVISOR');
    await createMaterialRequest([{ itemId: 'i1', qty: 1 }], { general: G });
    expect(state.request).toMatchObject({ isGeneral: true, generalReason: 'grease for the plates', costCenter: 'Press', orderId: null });
    expect(notifyRoles).toHaveBeenCalledWith(['OWNER', 'ADMIN'], 'mis.general_use', expect.objectContaining({ kind: 'request', requestId: 'r1' }), 'SUPERVISOR-1');
    notifyRoles.mockClear();
    await createMaterialRequest([{ itemId: 'i1', qty: 1 }], { orderId: 'o1', general: G });
    expect(state.request).toMatchObject({ isGeneral: false, costCenter: null });
    expect(notifyRoles).not.toHaveBeenCalledWith(['OWNER', 'ADMIN'], 'mis.general_use', expect.anything(), expect.anything());
  });
  it('a request with no order and no general block is refused', async () => {
    asRole('SUPERVISOR');
    await expect(createMaterialRequest([{ itemId: 'i1', qty: 1 }], { departmentId: 'd1' })).rejects.toThrow(/General \/ factory use/);
  });
});

const pendingRequest = () => ({
  id: 'r1', requestNumber: 'MRN-1', status: 'PENDING', orderId: null, departmentId: null, isGeneral: true, generalReason: 'grease', costCenter: 'Press', requestedById: 'sup-9',
  lines: [{ id: 'l1', itemId: 'i1', requestedQty: dec(10) }],
});

describe('R2-67 — the Supervisor hears the Store’s decision', () => {
  it('approve and issue now writes a decision notice for the requester only, linked to the request', async () => {
    state.request = pendingRequest();
    commitIssue.mockImplementationOnce(async (...a: unknown[]) => { await (a[1] as { inTransaction: (tx: unknown) => Promise<void> }).inTransaction(db); return { reference: 'R', lineCount: 1, totalQty: 4 }; });
    await approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 4 }], 'ok');
    expect(state.notifications).toEqual([{ userId: 'sup-9', type: 'mis.material_request.decided', payload: expect.objectContaining({ requestId: 'r1', decision: 'APPROVED', note: 'ok' }) }]);
    expect(commitIssue).toHaveBeenCalledWith([{ itemId: 'i1', qty: 4 }], expect.objectContaining({ materialRequestId: 'r1', general: { reason: 'grease', costCenter: 'Press' } }));
  });
  it('a rejection tells the requester why', async () => {
    state.request = pendingRequest();
    await rejectMaterialRequest('r1', 'Out of stock');
    expect(state.notifications[0]).toMatchObject({ userId: 'sup-9', type: 'mis.material_request.decided', payload: { decision: 'REJECTED', note: 'Out of stock' } });
  });
  it('a request with no recorded requester sends nothing and does not fail', async () => {
    state.request = { ...pendingRequest(), requestedById: null };
    await rejectMaterialRequest('r1', 'No');
    expect(state.notifications).toEqual([]);
  });
});

describe('R2-66 — fresh balances for the cart', () => {
  it('listItemBalances is a store.read call that maps item -> latest ledger balance', async () => {
    db.$queryRaw = async () => [{ item_id: 'i1', balance_qty: '12.5' }, { item_id: 'i2', balance_qty: 0 }];
    asRole('SUPERVISOR');
    await expect(listItemBalances()).resolves.toEqual({ i1: 12.5, i2: 0 });
  });
});

describe('R2-77 — Pick & Staging: stock moves only on handover', () => {
  it('approving for picking creates a PENDING pick list from the approved quantities and moves NO stock', async () => {
    state.request = pendingRequest();
    const out = await approveMaterialRequestForPicking('r1', [{ lineId: 'l1', actualIssuedQty: 6 }], 'pick it');
    expect(out).toEqual({ pickListId: 'pl1' });
    expect(state.request?.status).toBe('APPROVED');
    expect(state.pickCreated).toMatchObject({ materialRequestId: 'r1', lines: { create: [{ materialRequestLineId: 'l1', itemId: 'i1', requiredQty: 6 }] } });
    expect(commitIssue).not.toHaveBeenCalled();
    expect(state.ledger).toHaveLength(0);
    expect(state.notifications[0]).toMatchObject({ userId: 'sup-9', payload: { decision: 'APPROVED', pickList: true } });
  });
  it('refuses more than requested and an all-zero approval, before anything is written', async () => {
    state.request = pendingRequest();
    await expect(approveMaterialRequestForPicking('r1', [{ lineId: 'l1', actualIssuedQty: 10.01 }])).rejects.toThrow(/only 10 was requested/);
    await expect(approveMaterialRequestForPicking('r1', [{ lineId: 'l1', actualIssuedQty: 0 }])).rejects.toThrow(/Nothing to pick/);
    expect(state.request?.status).toBe('PENDING');
  });

  const list = (status: string, picked = 0) => {
    state.pickLines = [{ id: 'pk1', itemId: 'i1', requiredQty: dec(6), pickedQty: dec(picked) }];
    state.pickList = { id: 'pl1', status, lines: state.pickLines, materialRequest: { id: 'r1', requestNumber: 'MRN-1', orderId: null, departmentId: null, isGeneral: true, generalReason: 'grease', costCenter: 'Press', requestedById: 'sup-9' } };
  };
  // the fake reads Decimal-ish line values; keep them live as picks are written
  const sync = () => state.pickLines.forEach((l) => { if (typeof l.pickedQty === 'number') l.pickedQty = dec(l.pickedQty); });

  it('picks move PENDING -> PICKING, are capped at the approved quantity, and still move no stock', async () => {
    list('PENDING');
    await expect(recordPicks('pl1', [{ lineId: 'pk1', pickedQty: 7 }])).rejects.toThrow(/only 6 was approved/);
    await recordPicks('pl1', [{ lineId: 'pk1', pickedQty: 4 }]);
    sync();
    expect(state.pickList?.status).toBe('PICKING');
    expect(commitIssue).not.toHaveBeenCalled();
  });
  it('staging needs a PICKING list with something picked', async () => {
    list('PENDING');
    await expect(stagePickList('pl1')).rejects.toThrow(/Record what you picked/);
    list('PICKING', 0);
    await expect(stagePickList('pl1')).rejects.toThrow(/at least one line/);
    list('PICKING', 4);
    await stagePickList('pl1');
    expect(state.pickList?.status).toBe('STAGED');
    expect(commitIssue).not.toHaveBeenCalled();
  });
  it('handover is the ONLY step that issues: picked quantity only, linked to the request, flips the list on the issue’s transaction', async () => {
    list('STAGED', 4);
    commitIssue.mockImplementationOnce(async (...a: unknown[]) => { await (a[1] as { inTransaction: (tx: unknown) => Promise<void> }).inTransaction(db); return { reference: 'MRN-1', lineCount: 1, totalQty: 4 }; });
    await handOverPickList('pl1');
    expect(commitIssue).toHaveBeenCalledTimes(1);
    expect(commitIssue).toHaveBeenCalledWith([{ itemId: 'i1', qty: 4 }], expect.objectContaining({ materialRequestId: 'r1', general: { reason: 'grease', costCenter: 'Press' } }));
    expect(state.pickList).toMatchObject({ status: 'HANDED_OVER', handedOverToId: 'sup-9', handedOverById: 'STORE_GUY-1' });
    expect(state.notifications[0]).toMatchObject({ userId: 'sup-9' });
  });
  it('an unstaged or already handed-over list cannot be handed over', async () => {
    list('PICKING', 4);
    await expect(handOverPickList('pl1')).rejects.toThrow(/Stage the pick list/);
    list('HANDED_OVER', 4);
    await expect(handOverPickList('pl1')).rejects.toThrow(/already handed over/);
    expect(commitIssue).not.toHaveBeenCalled();
  });
  it('a short balance at handover refuses it and leaves the list STAGED', async () => {
    list('STAGED', 4);
    commitIssue.mockRejectedValueOnce(new Error('Cannot issue more than the stock balance (1 available)'));
    await expect(handOverPickList('pl1')).rejects.toThrow(/stock balance/);
    expect(state.pickList?.status).toBe('STAGED');
  });
});

describe('R2-79 — Return-to-Store', () => {
  it('a Store Guy’s return is accepted at once: stock is reversed into BOTH books, linked on the return, audited', async () => {
    await createStoreReturn({ itemId: 'i1', qty: 3, reason: 'unused after job' });
    expect(state.ledger[0]).toMatchObject({ changeQty: 3, balanceQty: 103, source: 'STORE_RETURN' });
    expect(state.txns[0]).toMatchObject({ type: 'IN', quantity: 3, balanceQty: 103, referenceNo: expect.stringMatching(/^RTN-/) });
    expect(state.returns[0]).toMatchObject({ status: 'ACCEPTED', ledgerId: 'l1', storeTxnId: 't1' });
  });
  it('a Supervisor’s return waits PENDING and moves no stock', async () => {
    asRole('SUPERVISOR');
    await createStoreReturn({ itemId: 'i1', qty: 3, reason: 'rejected sheets' });
    expect(state.returns[0].status).toBe('PENDING');
    expect(state.ledger).toHaveLength(0);
    expect(state.txns).toHaveLength(0);
  });
  it('the Store then accepts it (stock back in) — once; a second decision is refused', async () => {
    asRole('SUPERVISOR');
    await createStoreReturn({ itemId: 'i1', qty: 3, reason: 'rejected sheets' });
    asRole('STORE_GUY');
    await decideStoreReturn('ret1', 'ACCEPT');
    expect(state.returns[0].status).toBe('ACCEPTED');
    expect(state.ledger).toHaveLength(1);
    await expect(decideStoreReturn('ret1', 'ACCEPT')).rejects.toThrow(/already decided/);
    expect(state.ledger).toHaveLength(1);
  });
  it('a rejection needs a reason and moves nothing', async () => {
    asRole('SUPERVISOR');
    await createStoreReturn({ itemId: 'i1', qty: 3, reason: 'rejected sheets' });
    asRole('STORE_GUY');
    await expect(decideStoreReturn('ret1', 'REJECT', ' ')).rejects.toThrow(/reason is required/);
    await decideStoreReturn('ret1', 'REJECT', 'Wrong item');
    expect(state.returns[0]).toMatchObject({ status: 'REJECTED', decisionNote: 'Wrong item' });
    expect(state.ledger).toHaveLength(0);
  });
  it('refuses a missing reason, a zero quantity and a stale order before writing anything', async () => {
    await expect(createStoreReturn({ itemId: 'i1', qty: 3, reason: '' })).rejects.toThrow(/Say why/);
    await expect(createStoreReturn({ itemId: 'i1', qty: 0, reason: 'unused' })).rejects.toThrow(/more than zero/);
    await expect(createStoreReturn({ itemId: 'i1', qty: 1, reason: 'unused', orderId: 'gone' })).rejects.toThrow(/no longer exists/);
    expect(state.returns).toHaveLength(0);
  });
});

describe('Task B review — handover and returns', () => {
  it('a handover issues quietly for General use (the approval already told Owner + Admin) and records the PICKED qty on the request', async () => {
    state.pickLines = [
      { id: 'pk1', itemId: 'i1', materialRequestLineId: 'l1', requiredQty: dec(6), pickedQty: dec(4) },
      { id: 'pk2', itemId: 'i1', materialRequestLineId: 'l2', requiredQty: dec(2), pickedQty: dec(0) },
    ];
    state.pickList = { id: 'pl1', status: 'STAGED', lines: state.pickLines, materialRequest: { id: 'r1', requestNumber: 'MRN-1', orderId: null, departmentId: null, isGeneral: true, generalReason: 'grease', costCenter: 'Press', requestedById: 'sup-9' } };
    commitIssue.mockImplementationOnce(async (...a: unknown[]) => { await (a[1] as { inTransaction: (tx: unknown) => Promise<void> }).inTransaction(db); return { reference: 'MRN-1', lineCount: 1, totalQty: 4 }; });
    await handOverPickList('pl1');
    expect(commitIssue).toHaveBeenCalledWith([{ itemId: 'i1', qty: 4 }], expect.objectContaining({ skipGeneralNotice: true }));
    expect(notifyRoles).not.toHaveBeenCalled();
    expect(state.requestLineWrites).toEqual([
      { where: { id: 'l1' }, data: { actualIssuedQty: 4 } },
      { where: { id: 'l2' }, data: { actualIssuedQty: 0 } },
    ]);
  });
  it('a return can never exceed what was issued and not yet returned', async () => {
    state.issuedQty = 5;
    await expect(createStoreReturn({ itemId: 'i1', qty: 6, reason: 'unused' })).rejects.toThrow(/only 5 was issued/);
    expect(state.returns).toHaveLength(0);
    await createStoreReturn({ itemId: 'i1', qty: 5, reason: 'unused' });
    expect(state.returns[0].status).toBe('ACCEPTED');
  });
  it('accepting re-checks under the lock against ACCEPTED returns (issue shrank since it was raised)', async () => {
    asRole('SUPERVISOR');
    state.issuedQty = 3;
    await createStoreReturn({ itemId: 'i1', qty: 3, reason: 'rejected sheets' });
    state.issuedQty = 2;
    asRole('STORE_GUY');
    await expect(decideStoreReturn('ret1', 'ACCEPT')).rejects.toThrow(/only 2 was issued/);
  });
});
