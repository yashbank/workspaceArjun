/**
 * R3-STK — GRN, receipt cap + 2% tolerance, PO status, number and sequence, invoice match, cart idempotency.
 * Real `createGRN` / `addGRNItem` / `confirmGRN` / `commitReceipt` on a stateful in-memory database. A throw
 * inside `$transaction` restores the snapshot (a rollback); `$queryRaw` records the advisory-lock keys.
 *
 *   B01 PO status after a GRN        B02 open-PO guard            B03 cap + 2% + ADMIN override (+ audit)
 *   B04 stale snapshot               B05 txn sequence lock        B06 GRN number (factory month, retry)
 *   B10 invoice across deliveries    B11 cart idempotency         B12 invoice-on-another-PO warning
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asResult } from '@/lib/mis/action-result';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
const D = (n: number) => ({ toNumber: () => n, valueOf: () => n });
const n = (v: unknown): number => (v == null ? 0 : typeof v === 'number' ? v : (v as { toNumber(): number }).toNumber());
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const state: {
  pos: Row[]; poItems: Row[]; grns: Row[]; grnItems: Row[]; ledger: Row[]; txns: Row[]; invoices: Row[]; audits: Row[];
  events: string[]; lockCalls: string[][]; stamp: number; grnCreateAttempts: string[]; failGrnNumbers: number; keyed: Map<string, unknown>;
} = {
  pos: [], poItems: [], grns: [], grnItems: [], ledger: [], txns: [], invoices: [], audits: [],
  events: [], lockCalls: [], stamp: 0, grnCreateAttempts: [], failGrnNumbers: 0, keyed: new Map(),
};
const kraft = { id: 'i1', name: 'Kraft', code: 'K1', unit: 'KG', category: 'RAW_MATERIAL', isActive: true, deletedAt: null };
const stamp = () => new Date(Date.UTC(2026, 9, 1) + ++state.stamp);

const quarantine: Row[] = []; // R2-278
const grnView = (g: Row): Row => ({
  ...g,
  po: {
    ...state.pos.find((p) => p.id === g.poId),
    items: state.poItems.filter((p) => p.poId === g.poId).map((p) => ({
      id: p.id, description: p.description, quantity: D(p.quantity), receivedQuantity: D(p.receivedQuantity), item: { name: kraft.name, unit: kraft.unit },
    })),
  },
  supplierInvoiceAmount: g.supplierInvoiceAmount == null ? null : D(g.supplierInvoiceAmount),
  items: state.grnItems.filter((i) => i.grnId === g.id).map((i) => ({
    ...i, receivedQty: D(i.receivedQty), damageQuantity: D(i.damageQuantity ?? 0), dcQuantity: i.dcQuantity == null ? null : D(i.dcQuantity),
    poItem: { ...state.poItems.find((p) => p.id === i.poItemId), ratePerUnit: D(state.poItems.find((p) => p.id === i.poItemId)!.ratePerUnit), item: kraft },
  })),
});

const match = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'startsWith' in v) return String(row[k]).startsWith(v.startsWith);
    if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
    return row[k] === v;
  });

const db: Row = {
  misItem: { findMany: async ({ where }: Row) => [kraft].filter((i) => where.id.in.includes(i.id)), update: async () => null },
  misPurchaseOrder: {
    findUnique: async ({ where, include }: Row) => {
      const po = state.pos.find((p) => p.id === where.id);
      if (!po) return null;
      return include?.items ? { ...po, items: state.poItems.filter((i) => i.poId === po.id).map((i) => ({ id: i.id, itemId: i.itemId })) } : { ...po };
    },
    update: async ({ where, data }: Row) => { Object.assign(state.pos.find((p) => p.id === where.id)!, data); return null; },
    // The PO row lock: matches only while the PO is open for goods.
    updateMany: async ({ where }: Row) => { state.events.push('po-lock'); return { count: state.pos.filter((p) => p.id === where.id && (!where.status || where.status.in.includes(p.status))).length }; }, // R2-277: the reversal locks the row in any status
  },
  misPoItem: {
    findMany: async ({ where }: Row) => (state.events.push('po-lines'), state.poItems)
      .filter((p) => (where.poId ? p.poId === where.poId : where.id.in.includes(p.id)))
      .map((p) => ({ ...p, quantity: D(p.quantity), receivedQuantity: D(p.receivedQuantity), ratePerUnit: D(p.ratePerUnit) })),
    update: async ({ where, data }: Row) => { const p = state.poItems.find((x) => x.id === where.id)!; p.receivedQuantity = Math.round((p.receivedQuantity + n(data.receivedQuantity.increment) - n(data.receivedQuantity.decrement)) * 100) / 100; return p; }, // R2-277: decrement too
  },
  misGrn: {
    create: async ({ data }: Row) => {
      state.grnCreateAttempts.push(data.grnNumber);
      if (state.failGrnNumbers > 0) { state.failGrnNumbers -= 1; throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['grn_number'] } }); }
      const row = { id: `g${state.grns.length + 1}`, status: 'DRAFT', dcNumber: 'DC-1', supplierInvoiceNo: null, invoiceDate: null, supplierInvoiceAmount: null, ...data };
      state.grns.push(row);
      return { ...row };
    },
    findUnique: async ({ where }: Row) => { const g = state.grns.find((x) => (where.id ? x.id === where.id : x.grnNumber === where.grnNumber)); return g ? grnView(g) : null; },
    findMany: async ({ where }: Row) => state.grns.filter((g) => match(g, where)).map((g) => ({ ...grnView(g) })),
    updateMany: async ({ where, data }: Row) => {
      const g = state.grns.find((x) => x.id === where.id && (!where.status || x.status === where.status));
      if (g) Object.assign(g, data);
      return { count: g ? 1 : 0 };
    },
  },
  misGrnItem: {
    create: async ({ data }: Row) => { const row = { id: `gi${state.grnItems.length + 1}`, ...data }; state.grnItems.push(row); return row; },
    findUnique: async ({ where }: Row) => { const i = state.grnItems.find((x) => x.id === where.id); return i ? { ...i, receivedQty: D(i.receivedQty), damageQuantity: D(i.damageQuantity ?? 0), dcQuantity: i.dcQuantity == null ? null : D(i.dcQuantity) } : null; },
    update: async ({ where, data }: Row) => { const i = state.grnItems.find((x) => x.id === where.id)!; Object.assign(i, data); return i; },
  },
  misInventoryLedger: {
    findFirst: async ({ where }: Row) => { const rows = state.ledger.filter((l) => l.itemId === where.itemId); const last = rows.at(-1); return last ? { balanceQty: D(last.balanceQty) } : null; },
    create: async ({ data }: Row) => { const row = { id: `l${state.ledger.length + 1}`, createdAt: stamp(), ...data, changeQty: n(data.changeQty) }; state.ledger.push(row); return row; },
  },
  misStoreTransaction: {
    findFirst: async ({ where }: Row) => {
      const rows = state.txns.filter((t) => match(t, where));
      const last = rows.at(-1);
      return last ? { txnNumber: last.txnNumber, balanceQty: D(last.balanceQty) } : null;
    },
    create: async ({ data }: Row) => { const row = { id: `t${state.txns.length + 1}`, createdAt: stamp(), ...data, quantity: n(data.quantity) }; state.txns.push(row); return row; },
  },
  misSupplierInvoice: {
    upsert: async (args: Row) => { state.invoices.push(args); return null; },
    findFirst: async ({ where }: Row) => {
      const hit = state.invoices.find((i) => i.create.supplierId === where.supplierId && i.create.invoiceNo === where.invoiceNo && i.create.poId !== where.poId.not);
      return hit ? { po: { poNumber: state.pos.find((p) => p.id === hit.create.poId)?.poNumber } } : null;
    },
  },
  misOrder: { findFirst: async () => null },
  misOrderStockAllocation: { create: async () => null, deleteMany: async () => ({ count: 0 }) },
  // R2-278: damaged lots land here, never in the ledger.
  misQuarantineStock: {
    create: async ({ data }: Row) => { const row = { id: `q${quarantine.length + 1}`, status: 'HELD', ...data }; quarantine.push(row); return row; },
    findUnique: async ({ where }: Row) => quarantine.find((q) => q.id === where.id) ?? null,
    updateMany: async ({ where, data }: Row) => { const q = quarantine.find((x) => x.id === where.id && x.status === where.status); if (q) Object.assign(q, data); return { count: q ? 1 : 0 }; },
  },
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => {
    const snapshot = clone({ pos: state.pos, poItems: state.poItems, grns: state.grns, grnItems: state.grnItems, ledger: state.ledger, txns: state.txns, invoices: state.invoices });
    const tx: Row = { ...db, $queryRaw: async (_s: TemplateStringsArray, key: string) => { state.lockCalls.at(-1)?.push(key); return [{ locked: 1 }]; } };
    try { return await cb(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
  },
};
vi.mock('@/server/db', () => ({ db }));
vi.mock('./grn-alerts', () => ({ notifyGrnConfirmed: async () => undefined }));
vi.mock('./audit', () => ({ logAuditEvent: async (e: Row) => { state.audits.push(clone(e)); } }));
const lockSpy = vi.fn();
vi.mock('./stock-lock', () => ({
  lockStockKeys: async (tx: Row, keys: string[]) => { lockSpy([...keys]); state.lockCalls.push([]); await tx.$queryRaw`x${[...new Set(keys)].sort()[0] ?? ''}`; },
}));
// The shared idempotency table, in memory: first call applies in a transaction, a repeat answers with the stored result.
vi.mock('./idempotency', () => ({
  runIdempotent: async (envelope: { key: string }, apply: (tx: Row) => Promise<{ result: unknown }>) => {
    if (state.keyed.has(envelope.key)) return { outcome: 'DUPLICATE', result: state.keyed.get(envelope.key) };
    try {
      const out = await db.$transaction((tx: Row) => apply(tx));
      state.keyed.set(envelope.key, (out as { result: unknown }).result);
      return { outcome: 'APPLIED', result: (out as { result: unknown }).result };
    } catch (error) {
      return { outcome: 'RETRY', detail: (error as Error).message };
    }
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { addGRNItem, confirmGRN, createGRN, nextGrnNumber, updateGRNHeader, reverseGRN, returnQuarantineToSupplier } = await import('./grn');
const { commitReceipt } = await import('./store');

const grnRow = (id: string, over: Row = {}): Row => ({ id, grnNumber: id.toUpperCase(), poId: 'po1', status: 'DRAFT', dcNumber: 'DC-1', supplierInvoiceNo: null, invoiceDate: null, supplierInvoiceAmount: null, ...over });
const line = (grnId: string, poItemId: string, receivedQty: number, over: Row = {}): Row => ({ id: `${grnId}-${poItemId}-${state.grnItems.length}`, grnId, poItemId, receivedQty, damageQuantity: 0, dcQuantity: null, type: 'GENERAL', forOrderRef: null, ...over });
const as = (role: string) => getMisRole.mockResolvedValue(role);
const poStatus = (id = 'po1') => state.pos.find((p) => p.id === id)!.status;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    pos: [{ id: 'po1', poNumber: 'PO-1', status: 'APPROVED', bomRef: null, supplierId: 's1' }, { id: 'po2', poNumber: 'PO-2', status: 'APPROVED', bomRef: null, supplierId: 's1' }],
    poItems: [
      { id: 'pi1', poId: 'po1', itemId: 'i1', description: 'Kraft 120gsm', quantity: 100, receivedQuantity: 0, ratePerUnit: 10 },
      { id: 'pi2', poId: 'po1', itemId: 'i1', description: 'Kraft 140gsm', quantity: 100, receivedQuantity: 0, ratePerUnit: 10 },
    ],
    grns: [grnRow('g1'), grnRow('g2')], grnItems: [], ledger: [{ id: 'l0', itemId: 'i1', changeQty: 0, balanceQty: 0, source: 'OPENING', createdAt: stamp() }],
    txns: [], invoices: [], audits: [], events: [], lockCalls: [], stamp: 0, grnCreateAttempts: [], failGrnNumbers: 0, keyed: new Map(),
  });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  as('STORE_GUY');
  quarantine.length = 0;
});

describe('B01 PO status after a GRN', () => {
  it('two lines of 100 each, both fully received -> COMPLETE; 40 of 100 -> PARTIAL; the remaining 60 later -> COMPLETE', async () => {
    state.poItems = [state.poItems[0]];
    state.grnItems = [line('g1', 'pi1', 40)];
    await confirmGRN('g1');
    expect(poStatus()).toBe('PARTIAL');
    state.grnItems.push(line('g2', 'pi1', 60));
    await confirmGRN('g2');
    expect(poStatus()).toBe('COMPLETE');
  });

  it('a PO of two lines is COMPLETE once both are received', async () => {
    state.grnItems = [line('g1', 'pi1', 100), line('g1', 'pi2', 100)];
    await confirmGRN('g1');
    expect(poStatus()).toBe('COMPLETE');
  });

  it('commitReceipt moves the PO the same way', async () => {
    state.poItems = [state.poItems[0]];
    await commitReceipt([{ itemId: 'i1', qty: 40 }], { poId: 'po1' });
    expect(poStatus()).toBe('PARTIAL');
    await commitReceipt([{ itemId: 'i1', qty: 60 }], { poId: 'po1' });
    expect(poStatus()).toBe('COMPLETE');
  });
});

describe('B02 only an open PO takes goods', () => {
  it.each(['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'COMPLETE'])('createGRN refuses a %s PO', async (status) => {
    state.pos[0].status = status;
    await expect(createGRN({ poId: 'po1' })).rejects.toThrow(`PO PO-1 is ${status}; goods can only be received against an approved PO.`);
    expect(state.grns).toHaveLength(2);
  });

  it('a GRN drafted while APPROVED, whose PO is then cancelled, refuses confirm and writes nothing to either book', async () => {
    state.grnItems = [line('g1', 'pi1', 10)];
    state.pos[0].status = 'CANCELLED';
    await expect(confirmGRN('g1')).rejects.toThrow(/PO PO-1 is CANCELLED/);
    expect(state.grns.find((g) => g.id === 'g1')!.status).toBe('DRAFT');
    expect(state.ledger).toHaveLength(1);
    expect(state.txns).toHaveLength(0);
    expect(state.poItems[0].receivedQuantity).toBe(0);
  });

  it('commitReceipt refuses a PO that is not open', async () => {
    state.pos[0].status = 'DRAFT';
    await expect(commitReceipt([{ itemId: 'i1', qty: 1 }], { poId: 'po1' })).rejects.toThrow(/is DRAFT/);
    expect(state.ledger).toHaveLength(1);
  });
});

describe('B03 receipt cap, 2% tolerance, ADMIN override', () => {
  beforeEach(() => { state.poItems = [state.poItems[0]]; });

  it('(a) 102 of 100 is fine; 102.01 is refused for a Store Guy', async () => {
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: 102, dcQuantity: 102 })).resolves.toBeTruthy();
    await expect(addGRNItem('g2', { poItemId: 'pi1', receivedQty: 102.01, dcQuantity: 102.01 })).rejects.toThrow(/exceeds the order by more than 2% \(max 102 KG\)\. Ask an Admin to override\./);
    expect(state.grnItems).toHaveLength(1);
  });

  it('(b) ADMIN: no reason and a 2-character reason are refused; a real reason confirms and audits quantities only', async () => {
    as('ADMIN');
    state.grnItems = [line('g1', 'pi1', 102.01)];
    await expect(confirmGRN('g1')).rejects.toThrow(/more than 2%/);
    await expect(confirmGRN('g1', { overReceiptReason: 'ok' })).rejects.toThrow(/more than 2%/);
    expect(state.grns[0].status).toBe('DRAFT');
    await confirmGRN('g1', { overReceiptReason: 'short delivery note' });
    expect(state.grns[0].status).toBe('CONFIRMED');
    const audit = state.audits.find((a) => a.action === 'GRN_OVER_RECEIPT_OVERRIDE')!;
    expect(audit.after).toMatchObject({ grnId: 'g1', reason: 'short delivery note', lines: [{ poItemId: 'pi1', ordered: 100, receivedTotal: 102.01, max: 102 }] });
    expect(JSON.stringify(audit)).not.toMatch(/rate|amount|₹/i);
  });

  it('a STORE_GUY cannot override with a reason, at confirm or at add', async () => {
    state.grnItems = [line('g1', 'pi1', 150)];
    // R2-279 (CONTRACT): 150 of 100 is past the 5% ceiling, so the sentence now points at the Owner, not an Admin.
    await expect(confirmGRN('g1', { overReceiptReason: 'because I said so' })).rejects.toThrow(/Only the Owner can accept this much/);
    await expect(addGRNItem('g2', { poItemId: 'pi1', receivedQty: 150, dcQuantity: 150, overReceiptReason: 'because I said so' })).rejects.toThrow(/Only the Owner can accept this much/);
  });

  // R2-279 (CONTRACT): an Admin's override reaches the 5% ceiling; 110 of 100 is the Owner's call now.
  it('an ADMIN can add the line beyond tolerance (up to 5%) once they give the reason', async () => {
    as('ADMIN');
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: 104, dcQuantity: 104 })).rejects.toThrow(/Give a reason/);
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: 104, dcQuantity: 104, overReceiptReason: 'supplier over-shipped' })).resolves.toBeTruthy();
  });

  it('R2-279: past the 5% ceiling an Admin is refused even with a reason; the Owner accepts it with one, audited', async () => {
    as('ADMIN');
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: 110, dcQuantity: 110, overReceiptReason: 'supplier over-shipped' })).rejects.toThrow(/more than 5%.*Only the Owner can accept this much/);
    state.grnItems = [line('g1', 'pi1', 110)];
    await expect(confirmGRN('g1', { overReceiptReason: 'supplier over-shipped' })).rejects.toThrow(/Only the Owner/);
    expect(state.grns[0].status).toBe('DRAFT');
    as('OWNER');
    await expect(confirmGRN('g1')).rejects.toThrow(/Give a reason/);
    await confirmGRN('g1', { overReceiptReason: 'bulk deal agreed on the phone' });
    expect(state.grns[0].status).toBe('CONFIRMED');
    expect(state.audits.find((a) => a.action === 'GRN_OVER_RECEIPT_OVERRIDE')!.after).toMatchObject({ lines: [{ receivedTotal: 110 }] });
  });

  it('(c) commitReceipt of 500 against a line with 100 outstanding is refused for a Store Guy and writes nothing', async () => {
    await expect(commitReceipt([{ itemId: 'i1', qty: 500 }], { poId: 'po1' })).rejects.toThrow(/more than 5%/); // R2-279: 500 of 100 is past the ceiling
    expect(state.ledger).toHaveLength(1);
    expect(state.grns).toHaveLength(2);
  });

  it('commitReceipt: an Admin with a reason books it (within the 5% ceiling, R2-279) and audits the override', async () => {
    as('ADMIN');
    await commitReceipt([{ itemId: 'i1', qty: 105 }], { poId: 'po1', overReceiptReason: 'both lots arrived' });
    expect(state.poItems[0].receivedQuantity).toBe(105);
    expect(state.audits.some((a) => a.action === 'GRN_OVER_RECEIPT_OVERRIDE')).toBe(true);
  });

  it('(d) two lines of the same item, line 1 full: commitReceipt books line 2', async () => {
    state.poItems = [
      { id: 'pi1', poId: 'po1', itemId: 'i1', description: 'a', quantity: 100, receivedQuantity: 100, ratePerUnit: 10 },
      { id: 'pi2', poId: 'po1', itemId: 'i1', description: 'b', quantity: 100, receivedQuantity: 0, ratePerUnit: 10 },
    ];
    await commitReceipt([{ itemId: 'i1', qty: 50 }], { poId: 'po1' });
    expect(state.poItems.map((p) => p.receivedQuantity)).toEqual([100, 50]);
  });

  it('(e) confirm and commitReceipt take the PO-line, item and sequence keys in ONE sorted call', async () => {
    state.grnItems = [line('g1', 'pi1', 10)];
    await confirmGRN('g1');
    await commitReceipt([{ itemId: 'i1', qty: 5 }], { poId: 'po1' });
    expect(lockSpy).toHaveBeenCalledTimes(2);
    for (const [keys] of lockSpy.mock.calls) {
      expect(keys).toEqual(expect.arrayContaining(['i1', 'po-item:pi1', 'stxn-seq']));
    }
    expect(state.lockCalls.every((keys) => keys.length === 1)).toBe(true); // the fake lock sorts and takes them in order
  });
});

describe('B04 the confirm books what is on the GRN after the claim', () => {
  it('a line added before the claim is booked; an add or header edit racing a confirm (status already CONFIRMED) throws', async () => {
    await addGRNItem('g1', { poItemId: 'pi1', receivedQty: 10, dcQuantity: 10 });
    await confirmGRN('g1');
    expect(state.ledger.at(-1)!.balanceQty).toBe(10);
    // The GRN is no longer a draft: the status condition on the write makes the late writes fail.
    state.grns.find((g) => g.id === 'g1')!.status = 'DRAFT'; // pass loadDraftGrn's read ...
    const racing = db.misGrn.updateMany;
    db.misGrn.updateMany = async () => ({ count: 0 }); // ... and lose the conditional write
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: 1, dcQuantity: 1 })).rejects.toThrow('GRN is no longer a draft');
    await expect(updateGRNHeader('g1', { dcNumber: 'DC-9' })).rejects.toThrow('GRN is no longer a draft');
    db.misGrn.updateMany = racing;
    expect(state.grnItems).toHaveLength(1);
  });

  it('a line that appears on the GRN between the first read and the claim is not silently booked', async () => {
    state.grnItems = [line('g1', 'pi1', 10)];
    const original = db.misGrn.updateMany;
    db.misGrn.updateMany = async (args: Row) => {
      const out = await original(args);
      if (args.data.status === 'CONFIRMED') state.grnItems.push(line('g1', 'pi2', 5)); // added after we read, before our re-read
      return out;
    };
    await expect(confirmGRN('g1')).rejects.toThrow(/changed while it was being confirmed/);
    db.misGrn.updateMany = original;
    expect(state.grns[0].status).toBe('DRAFT');
    expect(state.ledger).toHaveLength(1);
  });
});

describe('B06 GRN number', () => {
  it('uses the factory month: 2026-10-31T20:00Z in Asia/Kolkata is November', () => {
    expect(nextGrnNumber(0, 'Asia/Kolkata', new Date('2026-10-31T20:00:00Z'))).toMatch(/^GRN-202611-\d{5}$/);
    expect(nextGrnNumber(0, 'UTC', new Date('2026-10-31T20:00:00Z'))).toMatch(/^GRN-202610-\d{5}$/);
  });

  it('a clash on attempt 0 succeeds on attempt 1', async () => {
    state.failGrnNumbers = 1;
    const created = await createGRN({ poId: 'po1' });
    expect(created.id).toBeTruthy();
    expect(state.grnCreateAttempts).toHaveLength(2);
    expect(state.grnCreateAttempts[0]).not.toBe(state.grnCreateAttempts[1]);
  });

  it('gives up after 5 attempts', async () => {
    state.failGrnNumbers = 99;
    await expect(createGRN({ poId: 'po1' })).rejects.toMatchObject({ code: 'P2002' });
    expect(state.grnCreateAttempts).toHaveLength(5);
  });
});

describe('B05 the daily transaction sequence is serialised', () => {
  it('every writer adds the global stxn-seq key to its lock set, and two movements get distinct numbers', async () => {
    state.grnItems = [line('g1', 'pi1', 10)];
    await confirmGRN('g1');
    await commitReceipt([{ itemId: 'i1', qty: 5 }], {});
    for (const [keys] of lockSpy.mock.calls) expect(keys).toContain('stxn-seq');
    const numbers = state.txns.map((t) => t.txnNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers[0]).toMatch(/^STXN-\d{8}-0001$/);
  });
});

describe('B10 one invoice, two deliveries', () => {
  it('matches the invoice against ALL confirmed GRNs naming it: MATCHED after the second confirm', async () => {
    state.grns = [
      grnRow('g1', { supplierInvoiceNo: 'INV-1', supplierInvoiceAmount: 1500 }),
      grnRow('g2', { supplierInvoiceNo: 'INV-1', supplierInvoiceAmount: 1500 }),
    ];
    state.poItems = [{ ...state.poItems[0], quantity: 150 }];
    state.grnItems = [line('g1', 'pi1', 100, { dcQuantity: 100 }), line('g2', 'pi1', 50, { dcQuantity: 50 })];
    // 100 + 50 units at 10 = 1500 = the invoice amount. The first GRN alone would be a quantity/price discrepancy.
    await confirmGRN('g1');
    expect(state.invoices.at(-1)!.create.status).not.toBe('MATCHED');
    await confirmGRN('g2');
    expect(state.invoices.at(-1)!.create.status).toBe('MATCHED');
  });
});

describe('B12 invoice already on another PO', () => {
  it('warns on confirm and on a header edit, and never blocks', async () => {
    state.invoices = [{ create: { poId: 'po2', invoiceNo: 'INV-7', supplierId: 's1' } }];
    state.grns[0].supplierInvoiceNo = 'INV-7';
    state.grnItems = [line('g1', 'pi1', 10)];
    const header = await updateGRNHeader('g1', { dcNumber: 'DC-1' });
    expect(header.warnings).toEqual(['Invoice INV-7 is already recorded on PO PO-2']);
    const confirmed = await confirmGRN('g1');
    expect(confirmed.warnings).toEqual(['Invoice INV-7 is already recorded on PO PO-2']);
    expect(state.grns[0].status).toBe('CONFIRMED');
  });

  it('no warning when the invoice is new', async () => {
    state.grns[0].supplierInvoiceNo = 'INV-NEW';
    state.grnItems = [line('g1', 'pi1', 10)];
    expect((await confirmGRN('g1')).warnings).toEqual([]);
  });
});

describe('B11 cart idempotency', () => {
  const KEY = '3f1d7c52-8f55-4f7e-9d57-1a2b3c4d5e6f';

  it('the same key twice books once and returns the first result', async () => {
    state.poItems = [state.poItems[0]];
    const first = await commitReceipt([{ itemId: 'i1', qty: 40 }], { poId: 'po1', idempotencyKey: KEY });
    const second = await commitReceipt([{ itemId: 'i1', qty: 40 }], { poId: 'po1', idempotencyKey: KEY });
    expect(second).toEqual(first);
    expect(state.ledger.filter((l) => l.source === 'GRN')).toHaveLength(1);
    expect(state.poItems[0].receivedQuantity).toBe(40);
    expect(state.audits.filter((a) => a.action === 'store.receipt.commit')).toHaveLength(1);
  });

  it('a refusal under a key writes nothing and the key stays free for the corrected cart', async () => {
    state.poItems = [state.poItems[0]];
    await expect(commitReceipt([{ itemId: 'i1', qty: 500 }], { poId: 'po1', idempotencyKey: KEY })).rejects.toThrow(/more than 5%/); // R2-279
    expect(state.keyed.has(KEY)).toBe(false);
    await expect(commitReceipt([{ itemId: 'i1', qty: 50 }], { poId: 'po1', idempotencyKey: KEY })).resolves.toMatchObject({ totalQty: 50 });
  });
});

describe('B21 refusals come back as data', () => {
  it('a thrown GrnStateError reaches asResult with the same text', async () => {
    state.pos[0].status = 'CANCELLED';
    const result = await asResult(() => createGRN({ poId: 'po1' }));
    expect(result).toEqual({ ok: false, detail: 'PO PO-1 is CANCELLED; goods can only be received against an approved PO.' });
  });
});

describe('R3 review: the PO row is locked first', () => {
  it('confirmGRN and commitReceipt take the PO row lock before reading the PO lines', async () => {
    state.grnItems = [line('g1', 'pi1', 10)];
    await confirmGRN('g1');
    expect(state.events.indexOf('po-lock')).toBeGreaterThanOrEqual(0);
    state.events.length = 0;
    await commitReceipt([{ itemId: 'i1', qty: 5 }], { poId: 'po1' });
    expect(state.events.indexOf('po-lock')).toBeLessThan(state.events.indexOf('po-lines'));
  });

  it('a PO cancelled after the page loaded is refused by the lock itself, and nothing is written', async () => {
    const original = db.misPurchaseOrder.updateMany;
    db.misPurchaseOrder.updateMany = async (args: Row) => { state.pos[0].status = 'CANCELLED'; return original(args); }; // the cancel lands just before our lock
    await expect(commitReceipt([{ itemId: 'i1', qty: 5 }], { poId: 'po1' })).rejects.toThrow(/PO PO-1 is CANCELLED/);
    state.grnItems = [line('g1', 'pi1', 10)];
    state.pos[0].status = 'APPROVED';
    await expect(confirmGRN('g1')).rejects.toThrow(/PO PO-1 is CANCELLED/);
    db.misPurchaseOrder.updateMany = original;
    expect(state.ledger).toHaveLength(1);
    expect(state.grns[0].status).toBe('DRAFT');
  });

  it('a PARTIAL PO is still receivable (the lock admits APPROVED, RECEIVING and PARTIAL)', async () => {
    state.poItems = [state.poItems[0]];
    await commitReceipt([{ itemId: 'i1', qty: 40 }], { poId: 'po1' });
    expect(poStatus()).toBe('PARTIAL');
    await expect(commitReceipt([{ itemId: 'i1', qty: 60 }], { poId: 'po1' })).resolves.toBeTruthy();
    expect(poStatus()).toBe('COMPLETE');
  });
});

describe('R3 review: a GRN-number clash on a keyed commit is retried', () => {
  it('the number is checked before use, so the keyed call books under the next number', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T05:00:00Z'));
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      state.grns.push(grnRow('gx', { grnNumber: nextGrnNumber(0, 'Asia/Kolkata') })); // attempt 0's number is taken
      state.poItems = [state.poItems[0]];
      const out = await commitReceipt([{ itemId: 'i1', qty: 10 }], { poId: 'po1', idempotencyKey: '7c0f3a52-1b6e-4d2a-8c11-2f3e4d5c6b7a' });
      expect(out.reference).toMatch(/^GRN-202610-/);
      expect(out.reference).not.toBe(state.grns.find((g) => g.id === 'gx')!.grnNumber);
      expect(state.ledger.filter((l) => l.source === 'GRN')).toHaveLength(1);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('R2-277 reverseGRN (Owner only)', () => {

  it('credits the stock back out in both books, takes the PO line counter back, reopens the PO and marks the GRN REVERSED, audited', async () => {
    state.poItems = [state.poItems[0]];
    state.grnItems = [line('g1', 'pi1', 100)];
    await confirmGRN('g1');
    expect(poStatus()).toBe('COMPLETE');
    as('OWNER');
    const out = await reverseGRN('g1', 'typed 100 for 10');
    expect(out).toMatchObject({ status: 'REVERSED', poStatus: 'APPROVED', reversed: [{ itemId: 'i1', qty: 100 }] });
    expect(state.grns[0]).toMatchObject({ status: 'REVERSED', reverseReason: 'typed 100 for 10', reversedById: 'u1' });
    expect(state.ledger.at(-1)).toMatchObject({ changeQty: -100, balanceQty: 0, source: 'GRN_REVERSAL', sourceId: 'g1' });
    expect(state.txns.at(-1)).toMatchObject({ type: 'OUT', quantity: 100, referenceNo: 'G1' });
    expect(state.poItems[0].receivedQuantity).toBe(0);
    expect(poStatus()).toBe('APPROVED');
    const audit = state.audits.find((a) => a.action === 'grn.reverse')!;
    expect(audit.after).toMatchObject({ status: 'REVERSED', reason: 'typed 100 for 10', poStatus: 'APPROVED' });
    expect(JSON.stringify(audit)).not.toMatch(/rate|amount|₹/i);
  });

  it('an Admin is refused; a draft GRN cannot be reversed; a reason is required', async () => {
    state.grnItems = [line('g1', 'pi1', 10)];
    await confirmGRN('g1');
    as('ADMIN');
    await expect(reverseGRN('g1', 'oops')).rejects.toThrow(/Not permitted/);
    as('OWNER');
    await expect(reverseGRN('g1', 'x')).rejects.toThrow(/reason/);
    await expect(reverseGRN('g2', 'never confirmed')).rejects.toThrow(/Only a confirmed GRN/);
    expect(state.grns[0].status).toBe('CONFIRMED');
  });
});

describe('R2-278 quarantine', () => {

  it('the damaged quantity on a confirmed line is held in quarantine, not booked to stock; the Owner returns it to the supplier', async () => {
    state.grnItems = [line('g1', 'pi1', 80, { damageQuantity: 20, dcQuantity: 100 })];
    await confirmGRN('g1');
    expect(state.ledger.at(-1)).toMatchObject({ changeQty: 80 });
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]).toMatchObject({ grnId: 'g1', itemId: 'i1', quantity: 20, status: 'HELD', supplierId: 's1' });
    as('ADMIN');
    await expect(returnQuarantineToSupplier(quarantine[0].id, 'sent back')).rejects.toThrow(/Not permitted/);
    as('OWNER');
    await expect(returnQuarantineToSupplier(quarantine[0].id, 'sent back with the driver')).resolves.toMatchObject({ status: 'RETURNED' });
    expect(quarantine[0]).toMatchObject({ status: 'RETURNED', returnNote: 'sent back with the driver', returnedById: 'u1' });
    await expect(returnQuarantineToSupplier(quarantine[0].id)).rejects.toThrow(/already returned/);
  });
});
