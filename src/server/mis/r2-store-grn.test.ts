/**
 * R2 Store / GRN / PO fixes, db-free.
 *   R2-37/38 role matrix pinned as-is (NOT backed by DECISIONS.md: D6 = AQL, D7 = line clearance) — awaiting sign-off.   R2-62/63 an issue names an order or a department.
 *   R2-69 PO needs a supplier.   R2-73 GRN needs paperwork.   R2-76 the Issue screen answers a refusal in words.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asResult } from '@/lib/mis/action-result';
import { ISSUE_TARGET_REQUIRED } from '@/lib/mis/issue-target';
import { can } from '@/lib/mis/permissions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake
type Row = Record<string, any>;

const state: { po: Row[]; ledger: Row[]; grn: Row; grnItem: Row; grnItemWrites: Row[] } = { po: [], ledger: [], grn: {}, grnItem: {}, grnItemWrites: [] };
const D = (n: number) => ({ toNumber: () => n });

vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/server/mis/auth', () => ({
  requirePermission: vi.fn(async () => ({ userId: 'u1', role: 'OWNER' })),
  MisForbiddenError: class extends Error {},
}));
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: vi.fn(async () => undefined) }));
vi.mock('@/server/mis/grn-alerts', () => ({ notifyGrnConfirmed: vi.fn(async () => undefined) }));
vi.mock('@/server/db', () => {
  const db: Row = {
    misPurchaseOrder: { create: async ({ data }: Row) => { const r = { id: 'po1', ...data }; state.po.push(r); return r; } },
    misGrn: { findUnique: async () => state.grn, updateMany: async () => ({ count: 1 }) },
    misGrnItem: { findUnique: async () => state.grnItem, update: async ({ data }: Row) => { state.grnItemWrites.push(data); return data; } },
    $transaction: async (fn: (tx: Row) => Promise<unknown>) => fn(db),
    misItem: { findFirst: async () => ({ id: 'i1', name: 'Kraft', code: 'K1', sku: null, category: 'RAW_MATERIAL' }) },
    misOrder: {
      findUnique: async () => ({ orderNumber: 'ORD-1', status: 'CONFIRMED' }),
      // R2-119: a bom-number-shaped ref resolves through the BOM's own number to its order.
      findFirst: async ({ where }: Row) => (where?.bom?.bomNumber === 'BOM-202610-00001' ? { orderNumber: 'ORD-202610-00001' } : null),
    },
    misDepartment: { findUnique: async () => ({ name: 'Press' }) },
    misInventoryLedger: { create: async ({ data }: Row) => { state.ledger.push(data); return data; } },
  };
  return { db };
});

const { createPO } = await import('@/server/mis/po');
const { createStoreOut } = await import('@/server/mis/store');
const { confirmGRN, updateGRNItem, GRN_PAPERWORK_REQUIRED } = await import('@/server/mis/grn');

beforeEach(() => { state.po = []; state.ledger = []; state.grnItemWrites = []; });

describe('R2-37 / R2-38 role matrix as currently built', () => {
  it('QC has no PO / GRN read and a supervisor has no direct store write (current matrix; pending sign-off)', () => {
    // R2-37 (signed off): QC may VIEW PO / GRN (po.view / grn.view) but holds neither the full read nor any write.
    expect(can('QC', 'po.view')).toBe(true);
    expect(can('QC', 'grn.view')).toBe(true);
    expect(can('QC', 'po.read')).toBe(false);
    expect(can('QC', 'grn.read')).toBe(false);
    expect(can('QC', 'po.write')).toBe(false);
    expect(can('QC', 'grn.write')).toBe(false);
    expect(can('SUPERVISOR', 'store.write')).toBe(false);
    expect(can('STORE_GUY', 'store.write')).toBe(true);
  });
});

describe('R2-69 a PO needs a supplier', () => {
  it('refuses a create with no supplier and writes nothing', async () => {
    await expect(createPO({ purpose: 'BUFFER_STOCK', supplierId: null })).rejects.toThrow(/select a supplier/i);
    await expect(createPO({ purpose: 'BUFFER_STOCK', supplierId: '  ' })).rejects.toThrow(/select a supplier/i);
    expect(state.po).toHaveLength(0);
  });
  it('creates one with a supplier', async () => {
    await createPO({ purpose: 'BUFFER_STOCK', supplierId: 's1' });
    expect(state.po[0].supplierId).toBe('s1');
  });
});

describe('R2-62 / R2-63 the store master OUT names an order or a department', () => {
  it('refuses an OUT with neither, before any stock moves', async () => {
    await expect(createStoreOut({ itemId: 'i1', quantity: 1 })).rejects.toThrow(ISSUE_TARGET_REQUIRED);
    expect(state.ledger).toHaveLength(0);
  });
});

describe('R2-73 a GRN needs a DC number or an invoice number to confirm', () => {
  it('refuses a blank-paperwork confirm', async () => {
    state.grn = { id: 'g1', status: 'DRAFT', dcNumber: ' ', supplierInvoiceNo: null, po: { bomRef: null, supplierId: 's1' }, items: [{ receivedQty: D(5), damageQuantity: D(0), poItem: { itemId: 'i1' } }] };
    await expect(confirmGRN('g1')).rejects.toThrow(GRN_PAPERWORK_REQUIRED);
  });
});

describe('R2-71 a "for an order" line names a real order — on edit too', () => {
  it('refuses turning a line FOR_ORDER with no order, or an unknown one, and writes nothing', async () => {
    state.grn = { id: 'g1', status: 'DRAFT', po: { items: [{ id: 'pi1', quantity: D(10), receivedQuantity: D(0) }] }, items: [{ id: 'gi1', poItemId: 'pi1', receivedQty: D(2) }] };
    state.grnItem = { id: 'gi1', grnId: 'g1', poItemId: 'pi1', type: 'GENERAL', forOrderRef: null, receivedQty: D(2), dcQuantity: null, damageQuantity: D(0) };
    await expect(updateGRNItem('gi1', { type: 'FOR_ORDER' })).rejects.toThrow(/pick the order/i);
    await expect(updateGRNItem('gi1', { type: 'FOR_ORDER', forOrderRef: 'ORD-202610-00099' })).rejects.toThrow(/not found/i);
    expect(state.grnItemWrites).toHaveLength(0);
  });

  it('R2-119: a FOR_ORDER line also accepts the BOM\'s own number, resolving to its order', async () => {
    state.grn = { id: 'g1', status: 'DRAFT', po: { items: [{ id: 'pi1', quantity: D(10), receivedQuantity: D(0) }] }, items: [{ id: 'gi1', poItemId: 'pi1', receivedQty: D(2) }] };
    state.grnItem = { id: 'gi1', grnId: 'g1', poItemId: 'pi1', type: 'GENERAL', forOrderRef: null, receivedQty: D(2), dcQuantity: null, damageQuantity: D(0) };
    await updateGRNItem('gi1', { type: 'FOR_ORDER', forOrderRef: 'BOM-202610-00001', dcQuantity: 2 });
    expect(state.grnItemWrites[0]).toMatchObject({ type: 'FOR_ORDER', forOrderRef: 'BOM-202610-00001' });
  });
});

describe('R2-76 a permission refusal on the Issue screen comes back as words', () => {
  const forbidden = () => Promise.reject(Object.assign(new Error('Not permitted: store.write'), { digest: 'MIS_FORBIDDEN' }));
  it('returns forbiddenDetail when the caller supplies one, and still throws otherwise', async () => {
    expect(await asResult(forbidden, { entity: 'Record', forbiddenDetail: 'You do not have permission to issue stock.' })).toEqual({ ok: false, detail: 'You do not have permission to issue stock.' });
    await expect(asResult(forbidden)).rejects.toThrow(/Not permitted/);
  });
});
