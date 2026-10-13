/**
 * Tester round 2, cluster C2 — PO draft lifecycle and the approved-BOM rule (D1).
 * #6 submit/approve guards, status guards on lines and cancel, #5 delete a draft, #4 edit the header,
 * D1/#9 block a PO against an unapproved BOM, #8/#30 the approved-BOM picker's data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const state: { pos: Row[]; items: Row[]; grns: Row[]; orders: Row[]; boms: Row[] } = { pos: [], items: [], grns: [], orders: [], boms: [] };
let seq = 0;
const nextId = () => `id-${++seq}`;
const D = (n: number) => ({ toNumber: () => n, valueOf: () => n });
const audit = vi.fn();

vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getPoApprovalThreshold: async () => 50000 }));

const db: Row = {
  misPurchaseOrder: {
    create: async ({ data }: Row) => { const row = { id: nextId(), status: 'DRAFT', ...data }; state.pos.push(row); return row; },
    findUnique: async ({ where }: Row) => state.pos.find((p) => p.id === where.id) ?? null,
    update: async ({ where, data }: Row) => { const row = state.pos.find((p) => p.id === where.id)!; Object.assign(row, data); return row; },
    delete: async ({ where }: Row) => { const i = state.pos.findIndex((p) => p.id === where.id); const [row] = state.pos.splice(i, 1); return row; },
  },
  misPoItem: {
    create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.items.push(row); return row; },
    findFirst: async () => null,
    findUnique: async ({ where }: Row) => state.items.find((i) => i.id === where.id) ?? null,
    findMany: async ({ where }: Row) => state.items.filter((i) => i.poId === where.poId).map((i) => ({ ...i, quantity: D(i.quantity), ratePerUnit: D(i.ratePerUnit ?? 0) })),
    update: async ({ where, data }: Row) => { const row = state.items.find((i) => i.id === where.id)!; Object.assign(row, data); return row; },
    delete: async ({ where }: Row) => { const i = state.items.findIndex((x) => x.id === where.id); const [row] = state.items.splice(i, 1); return row; },
    deleteMany: async ({ where }: Row) => { state.items = state.items.filter((i) => i.poId !== where.poId); },
  },
  misGrn: { count: async ({ where }: Row) => state.grns.filter((g) => g.poId === where.poId).length },
  misOrder: {
    findUnique: async ({ where }: Row) => {
      const order = state.orders.find((o) => o.orderNumber === where.orderNumber);
      return order ? { orderNumber: order.orderNumber, bom: state.boms.find((b) => b.orderId === order.id) ?? null } : null;
    },
  },
  misBom: {
    findMany: async ({ where }: Row) =>
      state.boms.filter((b) => b.status === where.status).map((b) => ({ order: state.orders.find((o) => o.id === b.orderId) })),
  },
  // R3-MST B28: cancelPO now reads the GRN count and writes the status inside one interactive transaction.
  misItem: { findFirst: async ({ where }: Row) => (where.id === 'i-gone' ? null : { id: where.id }) },
  $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: Row) => Promise<unknown>)(db) : Promise.all(arg as Promise<unknown>[])),
};
vi.mock('@/server/db', () => ({ get db() { return db; } }));

const po = await import('./po');
const { isBomNotApprovedDetail } = await import('@/lib/mis/po-errors');

const ORD_OK = 'ORD-202610-00001'; // BOM APPROVED
const ORD_DRAFT = 'ORD-202610-00002'; // BOM DRAFT
const ORD_NO_BOM = 'ORD-202610-00003'; // no BOM at all

beforeEach(() => {
  seq = 0;
  state.pos = []; state.items = []; state.grns = [];
  state.orders = [
    { id: 'o1', orderNumber: ORD_OK, customer: { name: 'Acme Foods' } },
    { id: 'o2', orderNumber: ORD_DRAFT, customer: null },
    { id: 'o3', orderNumber: ORD_NO_BOM, customer: null },
  ];
  state.boms = [{ id: 'b1', orderId: 'o1', status: 'APPROVED' }, { id: 'b2', orderId: 'o2', status: 'DRAFT' }];
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ADMIN');
});

const draftWithLine = async (qty = 5) => {
  // R3-MST B26/B27: a submittable PO needs a supplier and an item on every line, and a line quantity above zero.
  const created = await po.createPO({ purpose: 'BUFFER_STOCK', supplierId: 's1' });
  if (qty > 0) await po.addPOItem(created.id, { itemId: 'i1', description: 'Kraft', quantity: qty, ratePerUnit: 10 });
  else state.items.push({ id: nextId(), poId: created.id, itemId: 'i1', description: 'Kraft', quantity: 0, ratePerUnit: 0, sortOrder: 1 });
  return created;
};

describe('#6 submit and approve guards', () => {
  it('submitForApproval refuses a PO with no lines', async () => {
    const created = await po.createPO({ purpose: 'BUFFER_STOCK' });
    await expect(po.submitForApproval(created.id)).rejects.toThrow(/at least one line/i);
    expect(state.pos[0].status).toBe('DRAFT');
  });

  it('submitForApproval refuses when every line has a zero quantity', async () => {
    const created = await draftWithLine(0);
    await expect(po.submitForApproval(created.id)).rejects.toThrow(/at least one line/i);
  });

  it('submitForApproval refuses a PO that is not a draft (replayed request)', async () => {
    const created = await draftWithLine();
    await po.submitForApproval(created.id);
    await expect(po.submitForApproval(created.id)).rejects.toThrow(/not a draft/i);
  });

  it('submit works with a real line', async () => {
    const created = await draftWithLine();
    expect((await po.submitForApproval(created.id)).status).toBe('PENDING_APPROVAL');
  });

  it('approvePO refuses a pending PO whose lines are gone', async () => {
    const created = await draftWithLine();
    await po.submitForApproval(created.id);
    state.items = [];
    await expect(po.approvePO(created.id)).rejects.toThrow(/no line items/i);
  });

  it('approvePO refuses a PO that is still a draft', async () => {
    const created = await draftWithLine();
    await expect(po.approvePO(created.id)).rejects.toThrow(/not pending approval/i);
  });
});

describe('status guards on lines and cancel', () => {
  it.each(['PENDING_APPROVAL', 'APPROVED', 'CANCELLED'])('add / update / remove a line are refused on a %s PO', async (status) => {
    const created = await draftWithLine();
    const line = state.items[0];
    state.pos[0].status = status;
    await expect(po.addPOItem(created.id, { description: 'x', quantity: 1, ratePerUnit: 1 })).rejects.toThrow(/not a draft/i);
    await expect(po.updatePOItem(line.id, { quantity: 9 })).rejects.toThrow(/not a draft/i);
    await expect(po.removePOItem(line.id)).rejects.toThrow(/not a draft/i);
    expect(state.items).toHaveLength(1);
  });

  it('cancel is allowed from DRAFT and PENDING_APPROVAL', async () => {
    const a = await draftWithLine();
    expect((await po.cancelPO(a.id)).status).toBe('CANCELLED');
    const b = await draftWithLine();
    await po.submitForApproval(b.id);
    expect((await po.cancelPO(b.id)).status).toBe('CANCELLED');
  });

  it('cancel from APPROVED works with no GRN and is refused once a GRN exists', async () => {
    const a = await draftWithLine();
    state.pos[0].status = 'APPROVED';
    expect((await po.cancelPO(a.id)).status).toBe('CANCELLED');

    const b = await draftWithLine();
    state.pos[1].status = 'APPROVED';
    state.grns.push({ id: 'g1', poId: b.id });
    await expect(po.cancelPO(b.id)).rejects.toThrow(/goods receipt/i);
    expect(state.pos[1].status).toBe('APPROVED');
  });

  it.each(['RECEIVING', 'PARTIAL', 'COMPLETE', 'CANCELLED'])('cancel is refused from %s', async (status) => {
    const created = await draftWithLine();
    state.pos[0].status = status;
    await expect(po.cancelPO(created.id)).rejects.toThrow(/cannot be cancelled/i);
  });
});

describe('#5 deleteDraftPO', () => {
  it('removes a draft PO and its lines, and audits it', async () => {
    const created = await draftWithLine();
    await po.deleteDraftPO(created.id);
    expect(state.pos).toHaveLength(0);
    expect(state.items).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'po.delete', entityId: created.id }));
  });

  it('refuses anything that is not a draft', async () => {
    const created = await draftWithLine();
    await po.submitForApproval(created.id);
    await expect(po.deleteDraftPO(created.id)).rejects.toThrow(/not a draft/i);
    expect(state.pos).toHaveLength(1);
  });

  it('is behind po.write', async () => {
    const created = await draftWithLine();
    getMisRole.mockResolvedValue('QC');
    await expect(po.deleteDraftPO(created.id)).rejects.toThrow();
    expect(state.pos).toHaveLength(1);
  });
});

describe('#4 updatePO header edit', () => {
  it('changes supplier and notes on a draft and audits before/after', async () => {
    const created = await po.createPO({ purpose: 'BUFFER_STOCK', notes: 'old' });
    const after = await po.updatePO(created.id, { supplierId: 's1', notes: '  new  ' });
    expect(after.supplierId).toBe('s1');
    expect(after.notes).toBe('new');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'po.update', before: expect.any(Object), after: expect.any(Object) }));
  });

  it('refuses a PO that is not a draft', async () => {
    const created = await draftWithLine();
    await po.submitForApproval(created.id);
    await expect(po.updatePO(created.id, { notes: 'x' })).rejects.toThrow(/not a draft/i);
  });

  it('switching to buffer stock clears the BOM ref (same rule as createPO)', async () => {
    const created = await po.createPO({ purpose: 'FOR_ORDER', bomRef: ORD_OK });
    const after = await po.updatePO(created.id, { purpose: 'BUFFER_STOCK', bomRef: ORD_OK });
    expect(after.bomRef).toBeNull();
    expect(after.purpose).toBe('BUFFER_STOCK');
  });

  it('FOR_ORDER with no ref is refused exactly like createPO', async () => {
    const created = await po.createPO({ purpose: 'BUFFER_STOCK' });
    await expect(po.updatePO(created.id, { purpose: 'FOR_ORDER', bomRef: '' })).rejects.toThrow(/BOM reference/i);
  });

  it('pointing a draft at an order whose BOM is not approved is refused', async () => {
    const created = await po.createPO({ purpose: 'BUFFER_STOCK' });
    await expect(po.updatePO(created.id, { purpose: 'FOR_ORDER', bomRef: ORD_DRAFT })).rejects.toThrow(/BOM is not approved/);
    expect(state.pos[0].bomRef).toBeNull();
  });
});

describe('D1 / #9 a PO against an unapproved BOM is blocked', () => {
  it('createPO FOR_ORDER with an APPROVED BOM succeeds and stores the normalised order number', async () => {
    const created = await po.createPO({ purpose: 'FOR_ORDER', bomRef: ` ${ORD_OK.toLowerCase()} ` });
    expect(created.bomRef).toBe(ORD_OK);
  });

  it.each([
    ['a DRAFT BOM', ORD_DRAFT],
    ['an order with no BOM', ORD_NO_BOM],
    ['an order that does not exist', 'ORD-209912-99999'],
    ['free text that is not an order number', 'BOM-118'],
  ])('createPO FOR_ORDER against %s throws the typed "BOM is not approved" error and creates nothing', async (_label, ref) => {
    const err = await po.createPO({ purpose: 'FOR_ORDER', bomRef: ref }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^BOM is not approved for order /);
    expect(isBomNotApprovedDetail((err as Error).message)).toBe(true);
    expect(state.pos).toHaveLength(0);
  });

  it('a PENDING_APPROVAL BOM is not approved either', async () => {
    state.boms[1].status = 'PENDING_APPROVAL';
    await expect(po.createPO({ purpose: 'FOR_ORDER', bomRef: ORD_DRAFT })).rejects.toThrow(/BOM is not approved/);
  });

  it('buffer-stock POs are untouched by the rule', async () => {
    const created = await po.createPO({ purpose: 'BUFFER_STOCK', bomRef: ORD_DRAFT });
    expect(created.bomRef).toBeNull();
  });
});

describe('#8 / #30 listApprovedBomOrders', () => {
  it('returns only orders with an APPROVED BOM, as plain data labelled "order · customer"', async () => {
    const rows = await po.listApprovedBomOrders();
    expect(rows).toEqual([{ orderNumber: ORD_OK, customerName: 'Acme Foods', label: `${ORD_OK} · Acme Foods` }]);
  });

  it('is behind po.read', async () => {
    getMisRole.mockResolvedValue('WORKER');
    await expect(po.listApprovedBomOrders()).rejects.toThrow();
  });
});
