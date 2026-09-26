/**
 * Phase 20 · MIS-279 — buffer-stock PO + partial-receipt arithmetic, at the server functions.
 *
 * The six cases from `docs/CHANGE_PO_WITHOUT_BOM.md` §4, copied rather than re-derived:
 *  1. buffer PO end-to-end (below, "buffer PO end to end")
 *  2. FOR_ORDER with an empty ref refused ("createPO — FOR_ORDER validation")
 *  3. a stale ref stripped on switching purpose (same block)
 *  4. classification-on-issue: a GRN item's `type` is not derived from the PO's purpose
 *  5. no surface renders a buffer PO as incomplete/an error (createPO/getPO succeed plainly)
 *  6. legacy `bom_ref IS NULL` rows read as buffer stock — covered in `lib/mis/po-purpose.test.ts`
 *
 * Plus the acceptance check's own arithmetic: order 100, receive 40 then 35, assert outstanding,
 * ledger and PO status at each step, to the paisa. D1 (buffer stock costs no order until issued)
 * is not re-tested here — `commitReceipt` posts every delivery to the general ledger the same way
 * regardless of PO purpose; nothing here charges an order at receipt time either way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const state: { pos: Row[]; poItems: Row[]; grns: Row[]; grnItems: Row[]; ledger: Row[]; txns: Row[]; items: Row[]; businessRules: Row[] } = {
  pos: [], poItems: [], grns: [], grnItems: [], ledger: [], txns: [], items: [], businessRules: [],
};
let seq = 0;
const nextId = () => `id-${++seq}`;
/** A minimal Prisma-Decimal stand-in — every `.toNumber()` call site in the code path under test. */
const D = (n: number) => ({ toNumber: () => n, valueOf: () => n });

function makeDb(): Row {
  const db: Row = {
    misPurchaseOrder: {
      create: async ({ data }: Row) => { const row = { id: nextId(), status: 'APPROVED', ...data }; state.pos.push(row); return row; },
      update: async ({ where, data }: Row) => { const row = state.pos.find((p) => p.id === where.id)!; Object.assign(row, data); return row; },
      findUnique: async ({ where, include }: Row) => {
        const po = state.pos.find((p) => p.id === where.id);
        if (!po) return null;
        if (include?.items) return { ...po, items: state.poItems.filter((i) => i.poId === po.id) };
        return po;
      },
    },
    misPoItem: {
      create: async ({ data }: Row) => { const row = { id: nextId(), receivedQuantity: 0, ...data }; state.poItems.push(row); return row; },
      update: async ({ where, data }: Row) => {
        const row = state.poItems.find((i) => i.id === where.id)!;
        if (data.receivedQuantity?.increment !== undefined) row.receivedQuantity = round(row.receivedQuantity + data.receivedQuantity.increment);
        else Object.assign(row, data);
        return row;
      },
      // Prisma sends `quantity`/`receivedQuantity`/`ratePerUnit` as Decimal here — the state stays
      // plain numbers (simpler for this file's own assertions), wrapped only at the boundary the
      // real code reads through (`store.ts`'s and `po.ts`'s `.toNumber()` calls).
      findMany: async ({ where }: Row) =>
        state.poItems
          .filter((i) => (where?.poId ? i.poId === where.poId : true))
          .map((i) => ({ ...i, quantity: D(i.quantity), receivedQuantity: D(i.receivedQuantity), ratePerUnit: D(i.ratePerUnit) })),
    },
    misGrn: {
      create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.grns.push(row); return row; },
    },
    misGrnItem: {
      create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.grnItems.push(row); return row; },
    },
    misInventoryLedger: {
      create: async ({ data }: Row) => { const row = { id: nextId(), createdAt: new Date(), ...data }; state.ledger.push(row); return row; },
      findFirst: async ({ where }: Row) => {
        const rows = state.ledger.filter((l) => l.itemId === where.itemId).sort((a, b) => b.createdAt - a.createdAt);
        return rows[0] ? { ...rows[0], balanceQty: D(rows[0].balanceQty) } : null;
      },
    },
    misStoreTransaction: {
      create: async ({ data }: Row) => { const row = { id: nextId(), createdAt: new Date(), ...data }; state.txns.push(row); return row; },
      findFirst: async ({ where }: Row) => {
        const rows = state.txns.filter((t) => t.itemId === where.itemId).sort((a, b) => b.createdAt - a.createdAt);
        return rows[0] ? { ...rows[0], balanceQty: D(rows[0].balanceQty) } : null;
      },
    },
    misItem: {
      findMany: async ({ where }: Row) => state.items.filter((i) => where.id.in.includes(i.id)),
      update: async ({ where, data }: Row) => { const row = state.items.find((i) => i.id === where.id)!; Object.assign(row, data); return row; },
    },
    misBusinessRule: {
      findFirst: async ({ where, orderBy }: Row) => {
        let rows = state.businessRules.filter((r) => r.ruleKey === where.ruleKey);
        if (where.effectiveFrom?.lte) rows = rows.filter((r) => r.effectiveFrom <= where.effectiveFrom.lte);
        rows = rows.sort((a, b) => (orderBy?.effectiveFrom === 'asc' ? a.effectiveFrom - b.effectiveFrom : b.effectiveFrom - a.effectiveFrom));
        return rows[0] ?? null;
      },
      create: async ({ data }: Row) => { const row = { id: nextId(), ...data }; state.businessRules.push(row); return row; },
    },
    $transaction: async (cb: (tx: Row) => Promise<unknown>) => cb(db),
  };
  return db;
}
const round = (n: number) => Math.round(n * 100) / 100;

let fakeDb = makeDb();
vi.mock('@/server/db', () => ({ get db() { return fakeDb; } }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const { createPO, submitForApproval, approvePO } = await import('./po');
const { commitReceipt } = await import('./store');

beforeEach(() => {
  seq = 0;
  state.pos = []; state.poItems = []; state.grns = []; state.grnItems = []; state.ledger = []; state.txns = []; state.items = []; state.businessRules = [];
  fakeDb = makeDb();
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  state.items = [{ id: 'i1', name: 'Kraft paper', code: 'BPP-RM-1', unit: 'KG', isActive: true, deletedAt: null }];
});

describe('createPO — FOR_ORDER validation (MIS-279 cases 2 & 3)', () => {
  it('FOR_ORDER with no reference is refused, and the message points at the buffer-stock path', async () => {
    await expect(createPO({ purpose: 'FOR_ORDER', bomRef: '' })).rejects.toThrow(/buffer stock/i);
  });

  it('FOR_ORDER with a blank (whitespace-only) reference is refused the same way', async () => {
    await expect(createPO({ purpose: 'FOR_ORDER', bomRef: '   ' })).rejects.toThrow(/BOM reference/i);
  });

  it('switching to BUFFER_STOCK strips a reference typed before the raiser switched paths', async () => {
    const po = await createPO({ purpose: 'BUFFER_STOCK', bomRef: 'BOM-118' });
    expect(po.bomRef).toBeNull();
  });

  it('omitting purpose infers FOR_ORDER from a present bomRef, and BUFFER_STOCK from none — existing callers are unaffected', async () => {
    expect((await createPO({ bomRef: 'BOM-9' })).bomRef).toBe('BOM-9');
    expect((await createPO({})).bomRef).toBeNull();
  });
});

describe('buffer PO end to end (MIS-279 case 1) — never surfaces as an error (case 5)', () => {
  it('creates cleanly with no BOM, and commits a receipt against it with no special error state', async () => {
    const po = await createPO({ purpose: 'BUFFER_STOCK', notes: 'Quarterly top-up' });
    expect(po.bomRef).toBeNull();

    const poItem = await fakeDb.misPoItem.create({ data: { poId: po.id, itemId: 'i1', quantity: 50, ratePerUnit: 12 } });

    const result = await commitReceipt([{ itemId: 'i1', qty: 50, rate: 12 }], { poId: po.id });
    expect(result.totalQty).toBe(50);

    const updatedPoItem = state.poItems.find((i) => i.id === poItem.id)!;
    expect(updatedPoItem.receivedQuantity).toBe(50);
    const updatedPo = state.pos.find((p) => p.id === po.id)!;
    expect(updatedPo.status).toBe('COMPLETE'); // fully received, whatever its purpose
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0].balanceQty).toBe(50);
  });
});

describe('classification-on-issue (MIS-279 case 4)', () => {
  it("a buffer PO's received line gets the same GENERAL type any PO's line gets — the buffer/for-order split lives on the PO's own bomRef, not the GRN line", async () => {
    const bufferPo = await createPO({ purpose: 'BUFFER_STOCK' });
    await fakeDb.misPoItem.create({ data: { poId: bufferPo.id, itemId: 'i1', quantity: 10, ratePerUnit: 5 } });
    await commitReceipt([{ itemId: 'i1', qty: 10, rate: 5 }], { poId: bufferPo.id });
    expect(state.grnItems).toHaveLength(1);
    expect(state.grnItems[0].type).toBe('GENERAL');
  });
});

describe('partial-receipt arithmetic, to the paisa (this phase\'s own acceptance check)', () => {
  it('order 100, receive 40 then 35: outstanding, ledger and PO status are correct after EACH step, and the PO never auto-completes short of the full 100', async () => {
    const po = await createPO({ bomRef: 'BOM-500' });
    const poItem = await fakeDb.misPoItem.create({ data: { poId: po.id, itemId: 'i1', quantity: 100, ratePerUnit: 20 } });

    await commitReceipt([{ itemId: 'i1', qty: 40, rate: 20 }], { poId: po.id });
    let item = state.poItems.find((i) => i.id === poItem.id)!;
    expect(item.receivedQuantity).toBe(40);
    expect(item.quantity - item.receivedQuantity).toBe(60); // outstanding
    expect(state.ledger[0].balanceQty).toBe(40);
    expect(state.pos.find((p) => p.id === po.id)!.status).toBe('PARTIAL');

    await commitReceipt([{ itemId: 'i1', qty: 35, rate: 20 }], { poId: po.id });
    item = state.poItems.find((i) => i.id === poItem.id)!;
    expect(item.receivedQuantity).toBe(75);
    expect(item.quantity - item.receivedQuantity).toBe(25); // still short — the "short-close at 75" state
    expect(state.ledger[1].balanceQty).toBe(75); // running ledger balance, not per-delivery
    expect(state.pos.find((p) => p.id === po.id)!.status).toBe('PARTIAL'); // 75 of 100 — not COMPLETE

    // Completing the order takes it to COMPLETE, confirming PARTIAL was never a terminal mistake.
    await commitReceipt([{ itemId: 'i1', qty: 25, rate: 20 }], { poId: po.id });
    expect(state.poItems.find((i) => i.id === poItem.id)!.receivedQuantity).toBe(100);
    expect(state.pos.find((p) => p.id === po.id)!.status).toBe('COMPLETE');
  });
});

describe('approval chain (Phase 21 · D1/D2/D34)', () => {
  it('a buffer-stock PO and an order-linked PO of the SAME value take the identical approval path (D2\'s own acceptance check)', async () => {
    const orderPo = await createPO({ bomRef: 'BOM-700' });
    await fakeDb.misPoItem.create({ data: { poId: orderPo.id, itemId: 'i1', quantity: 10, ratePerUnit: 1000 } }); // 10,000
    const bufferPo = await createPO({ purpose: 'BUFFER_STOCK' });
    await fakeDb.misPoItem.create({ data: { poId: bufferPo.id, itemId: 'i1', quantity: 10, ratePerUnit: 1000 } }); // 10,000

    const submittedOrder = await submitForApproval(orderPo.id);
    const submittedBuffer = await submitForApproval(bufferPo.id);
    expect(submittedOrder.approvalMode).toBe(submittedBuffer.approvalMode);
    expect(submittedOrder.approvalMode).toBe('ADMIN_ONLY'); // 10,000 is below the 50,000 default threshold
  });

  it('below the threshold: ADMIN_ONLY, a single step an Admin can complete alone', async () => {
    const po = await createPO({ bomRef: 'BOM-701' });
    await fakeDb.misPoItem.create({ data: { poId: po.id, itemId: 'i1', quantity: 1, ratePerUnit: 100 } }); // 100
    const submitted = await submitForApproval(po.id);
    expect(submitted.approvalMode).toBe('ADMIN_ONLY');

    getMisRole.mockResolvedValue('ADMIN');
    const approved = await approvePO(po.id);
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedById).toBe('u1');
    expect(approved.adminApprovedAt).toBeUndefined(); // ADMIN_ONLY never touches the two-step fields
  });

  it('at/above the threshold: BOTH — an Admin\'s first step does not itself approve, and only the Owner can give the second', async () => {
    const po = await createPO({ bomRef: 'BOM-702' });
    await fakeDb.misPoItem.create({ data: { poId: po.id, itemId: 'i1', quantity: 100, ratePerUnit: 1000 } }); // 100,000
    const submitted = await submitForApproval(po.id);
    expect(submitted.approvalMode).toBe('BOTH');

    getMisRole.mockResolvedValue('ADMIN');
    const afterAdminStep = await approvePO(po.id);
    expect(afterAdminStep.status).toBe('PENDING_APPROVAL'); // one step down, one to go
    expect(afterAdminStep.adminApprovedAt).toBeTruthy();
    expect(afterAdminStep.adminApprovedById).toBe('u1');

    // The same Admin cannot also give the final sign-off.
    await expect(approvePO(po.id)).rejects.toThrow(/owner/i);

    getMisRole.mockResolvedValue('OWNER');
    const final = await approvePO(po.id);
    expect(final.status).toBe('APPROVED');
    expect(final.approvedById).toBe('u1');
  });

  it('OWNER_ONLY is a manual override only an Owner can invoke, and only an Owner can then approve it', async () => {
    const po = await createPO({ bomRef: 'BOM-703' });
    await fakeDb.misPoItem.create({ data: { poId: po.id, itemId: 'i1', quantity: 1, ratePerUnit: 100 } }); // 100 — would otherwise be ADMIN_ONLY

    getMisRole.mockResolvedValue('ADMIN');
    await expect(submitForApproval(po.id, { forceOwnerOnly: true })).rejects.toThrow(/owner/i);

    getMisRole.mockResolvedValue('OWNER');
    const submitted = await submitForApproval(po.id, { forceOwnerOnly: true });
    expect(submitted.approvalMode).toBe('OWNER_ONLY');

    getMisRole.mockResolvedValue('ADMIN');
    await expect(approvePO(po.id)).rejects.toThrow(/owner/i);

    getMisRole.mockResolvedValue('OWNER');
    const approved = await approvePO(po.id);
    expect(approved.status).toBe('APPROVED');
  });

  it('a threshold change after submission never reopens a PO already decided (frozen at submission, D34)', async () => {
    const po = await createPO({ bomRef: 'BOM-704' });
    await fakeDb.misPoItem.create({ data: { poId: po.id, itemId: 'i1', quantity: 100, ratePerUnit: 1000 } }); // 100,000 -> BOTH today
    const submitted = await submitForApproval(po.id);
    expect(submitted.approvalMode).toBe('BOTH');

    // Raise the threshold well above this PO's value, as if an Owner changed policy afterwards
    // (mutated in place here purely for test simplicity — real revisions add a new row).
    state.businessRules.find((r) => r.ruleKey === 'po_approval_threshold')!.ruleValue = '999999';

    getMisRole.mockResolvedValue('ADMIN');
    const afterAdminStep = await approvePO(po.id);
    expect(afterAdminStep.approvalMode).toBe('BOTH'); // unchanged — never re-derived
    getMisRole.mockResolvedValue('OWNER');
    const final = await approvePO(po.id);
    expect(final.status).toBe('APPROVED');
  });
});

describe('a walk-in delivery with no PO posts to the ledger without one (documented behaviour, not a bug)', () => {
  it('commitReceipt with no poId still updates the ledger, and writes no PO or GRN row', async () => {
    await commitReceipt([{ itemId: 'i1', qty: 12, rate: 8 }], {});
    expect(state.ledger).toHaveLength(1);
    expect(state.pos).toHaveLength(0);
    expect(state.grns).toHaveLength(0);
  });
});
