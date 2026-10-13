/**
 * R3-MST B24 / B25 / B29 / B31 — item codes and edits, adjust/delete results as values, and the
 * supplier / customer delete and restore guards.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake
type Row = Record<string, any>;

const state: { items: Row[]; suppliers: Row[]; customers: Row[]; pos: Row[]; orders: Row[]; audits: Row[]; failCreate: Row[] } = {
  items: [], suppliers: [], customers: [], pos: [], orders: [], audits: [], failCreate: [],
};
let seq = 0;
const p2002 = (field: string) => Object.assign(new Error(`Unique constraint failed on the fields: (\`${field}\`)`), { code: 'P2002', meta: { target: [field] } });

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async (e: Row) => { state.audits.push(e); } }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const adjustInventory = vi.fn();
vi.mock('@/server/mis/inventory', () => ({ adjustInventory: (...a: unknown[]) => adjustInventory(...a) }));

const byId = (rows: Row[], where: Row) => rows.find((r) => r.id === where.id) ?? null;
const copyById = (rows: Row[], where: Row) => { const r = byId(rows, where); return r ? { ...r } : null; };
vi.mock('@/server/db', () => ({
  db: {
    misItem: {
      findMany: async () => state.items.map((i) => ({ code: i.code })),
      findUnique: async ({ where }: Row) => copyById(state.items, where),
      create: async ({ data }: Row) => {
        const fail = state.failCreate.shift();
        if (fail) throw fail;
        if (state.items.some((i) => i.code === data.code)) throw p2002('code');
        const row = { id: `i${++seq}`, ...data };
        state.items.push(row);
        return row;
      },
      update: async ({ where, data }: Row) => {
        if (data.code && state.items.some((i) => i.code === data.code && i.id !== where.id)) throw p2002('code');
        const row = byId(state.items, where)!; Object.assign(row, data); return { ...row };
      },
    },
    misSupplier: {
      findUnique: async ({ where }: Row) => byId(state.suppliers, where),
      update: async ({ where, data }: Row) => { const row = byId(state.suppliers, where)!; Object.assign(row, data); return { ...row }; },
    },
    misCustomer: {
      findUnique: async ({ where }: Row) => byId(state.customers, where),
      update: async ({ where, data }: Row) => { const row = byId(state.customers, where)!; Object.assign(row, data); return { ...row }; },
    },
    misPurchaseOrder: {
      count: async ({ where }: Row) => state.pos.filter((p) => p.supplierId === where.supplierId && where.status.in.includes(p.status)).length,
    },
    misOrder: {
      findMany: async ({ where }: Row) => state.orders.filter((o) => o.customerId === where.customerId).map((o) => ({ status: o.status })),
    },
  },
}));

const { createItem, updateItem } = await import('./item');
const { createItemAction, adjustInventoryAction } = await import('@/app/(mis)/mis/inventory/actions');
const { saveItemAction } = await import('@/app/(mis)/mis/masters/items/actions');
const { deleteSupplier, restoreSupplier } = await import('./supplier');
const { deleteCustomer, restoreCustomer } = await import('./customer');
const { deleteSupplierAction, restoreSupplierAction } = await import('@/app/(mis)/mis/suppliers/actions');
const { deleteCustomerAction, restoreCustomerAction } = await import('@/app/(mis)/mis/customers/actions');

const as = (role: string) => { getCurrentUser.mockResolvedValue({ id: 'u1' }); getMisRole.mockResolvedValue(role); };

beforeEach(() => {
  state.items = []; state.suppliers = []; state.customers = []; state.pos = []; state.orders = []; state.audits = []; state.failCreate = [];
  seq = 0;
  vi.clearAllMocks();
  as('ADMIN');
});

describe('B24 item codes and edits', () => {
  it('createItem with a blank code allocates the next ITM code (deleted items counted)', async () => {
    state.items.push({ id: 'x', code: 'ITM-0007', deletedAt: new Date() }, { id: 'y', code: 'MANUAL-1' });
    const created = await createItem({ code: '  ', name: 'Glue' });
    expect(created.code).toBe('ITM-0008');
  });

  it('createItemAction: a P2002 on the first try uses the next code', async () => {
    state.failCreate.push(p2002('code'));
    const r = await createItemAction({ name: 'Glue', category: 'OTHER' as never, unit: 'KG' as never });
    expect(r).toEqual({ ok: true, value: { id: expect.any(String), code: 'ITM-0002' } });
  });

  it('createItemAction needs a name and is refused as a value, not a throw', async () => {
    const r = await createItemAction({ name: '   ', category: 'OTHER' as never, unit: 'KG' as never });
    expect(r).toMatchObject({ ok: false });
    expect(state.items).toHaveLength(0);
  });

  it('ADMIN edits the code: stored uppercase, audited with before/after', async () => {
    state.items.push({ id: 'a', code: 'ITM-0001', name: 'Glue' });
    await updateItem('a', { code: ' glue-9 ' });
    expect(state.items[0].code).toBe('GLUE-9');
    expect(state.audits[0]).toMatchObject({ action: 'item.update', before: { code: 'ITM-0001' }, after: { code: 'GLUE-9' } });
  });

  it('an empty or over-long code is refused', async () => {
    state.items.push({ id: 'a', code: 'ITM-0001', name: 'Glue' });
    await expect(updateItem('a', { code: '   ' })).rejects.toThrow(/cannot be empty/);
    await expect(updateItem('a', { code: 'X'.repeat(41) })).rejects.toThrow(/too long/);
    expect(state.items[0].code).toBe('ITM-0001');
  });

  it('a duplicate code comes back as the friendly message', async () => {
    state.items.push({ id: 'a', code: 'ITM-0001', name: 'Glue' }, { id: 'b', code: 'ITM-0002', name: 'Tape' });
    const r = await saveItemAction('b', { code: 'ITM-0001', name: 'Tape' });
    expect(r).toEqual({ ok: false, detail: "Item with code 'ITM-0001' already exists" });
  });

  it('STORE_GUY cannot edit an item', async () => {
    as('STORE_GUY');
    state.items.push({ id: 'a', code: 'ITM-0001', name: 'Glue' });
    await expect(updateItem('a', { code: 'NEW' })).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });

  it('a blank name is refused on create and on update', async () => {
    state.items.push({ id: 'a', code: 'ITM-0001', name: 'Glue' });
    await expect(createItem({ code: 'X', name: '  ' })).rejects.toThrow(/name is required/i);
    await expect(updateItem('a', { name: ' ' })).rejects.toThrow(/name is required/i);
    await expect(createItem({ code: 'X', name: 'N'.repeat(121) })).rejects.toThrow(/name is required/i);
  });
});

describe('B25 / B31 actions return results as values', () => {
  it('adjustInventoryAction hands the server refusal back as { ok: false }', async () => {
    adjustInventory.mockRejectedValue(new Error('Adjustment would result in negative balance'));
    expect(await adjustInventoryAction('i1', -5, 'count')).toEqual({ ok: false, detail: 'Adjustment would result in negative balance' });
  });

  it('adjustInventoryAction returns ok on success', async () => {
    adjustInventory.mockResolvedValue(undefined);
    expect(await adjustInventoryAction('i1', 5, 'count')).toEqual({ ok: true, value: undefined });
  });
});

describe('B29 supplier guards', () => {
  const supplier = (over: Row = {}) => { state.suppliers.push({ id: 's1', name: 'Acme', deletedAt: null, ...over }); };

  it.each(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIAL'])('delete is refused while a %s PO exists', async (status) => {
    supplier();
    state.pos.push({ supplierId: 's1', status });
    await expect(deleteSupplier('s1')).rejects.toThrow('Supplier has 1 open PO');
    expect(state.suppliers[0].deletedAt).toBeNull();
  });

  it('delete works when only completed or cancelled POs exist', async () => {
    supplier();
    state.pos.push({ supplierId: 's1', status: 'COMPLETE' }, { supplierId: 's1', status: 'CANCELLED' });
    await deleteSupplier('s1');
    expect(state.suppliers[0].deletedAt).toBeInstanceOf(Date);
  });

  it('an already-deleted supplier cannot be deleted again', async () => {
    supplier({ deletedAt: new Date() });
    await expect(deleteSupplier('s1')).rejects.toThrow(/already deleted/);
  });

  it('restore refuses an unknown id and a supplier that is not deleted', async () => {
    await expect(restoreSupplier('nope')).rejects.toThrow(/not found/i);
    supplier();
    await expect(restoreSupplier('s1')).rejects.toThrow(/not deleted/);
  });

  it('the actions return the refusal as a value', async () => {
    supplier();
    state.pos.push({ supplierId: 's1', status: 'DRAFT' });
    expect(await deleteSupplierAction('s1')).toEqual({ ok: false, detail: expect.stringMatching(/open PO/) });
    expect(await restoreSupplierAction('s1')).toMatchObject({ ok: false });
  });
});

describe('B29 customer guards', () => {
  const customer = (over: Row = {}) => { state.customers.push({ id: 'c1', name: 'Acme Foods', deletedAt: null, ...over }); };

  it('delete is refused while a non-closed order exists', async () => {
    customer();
    state.orders.push({ customerId: 'c1', status: 'IN_PRODUCTION' }, { customerId: 'c1', status: 'DELIVERED' });
    await expect(deleteCustomer('c1')).rejects.toThrow('Customer has 1 open order');
    expect(state.customers[0].deletedAt).toBeNull();
  });

  it('delete works when every order is closed', async () => {
    customer();
    state.orders.push({ customerId: 'c1', status: 'CANCELLED' }, { customerId: 'c1', status: 'DELIVERED' }, { customerId: 'c1', status: 'COMPLETED' });
    await deleteCustomer('c1');
    expect(state.customers[0].deletedAt).toBeInstanceOf(Date);
  });

  it('an already-deleted customer cannot be deleted again; restore guards unknown / not-deleted', async () => {
    customer({ deletedAt: new Date() });
    await expect(deleteCustomer('c1')).rejects.toThrow(/already deleted/);
    await expect(restoreCustomer('nope')).rejects.toThrow(/not found/i);
    state.customers[0].deletedAt = null;
    await expect(restoreCustomer('c1')).rejects.toThrow(/not deleted/);
  });

  it('the actions return the refusal as a value', async () => {
    customer();
    state.orders.push({ customerId: 'c1', status: 'DRAFT' });
    expect(await deleteCustomerAction('c1')).toEqual({ ok: false, detail: expect.stringMatching(/open order/) });
    expect(await restoreCustomerAction('c1')).toMatchObject({ ok: false });
  });
});
