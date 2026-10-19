/**
 * R2-83 server-side pagination, db-free: every list function returns `{ rows, total }`, pages 25 at a time, turns the
 * search into a where clause (not a client filter), and keeps its permission gate and scoping.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can } from '@/lib/mis/permissions';
import type { MisAction } from '@/lib/mis/permissions';
import type { MisRoleName } from '@/lib/mis/roles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake
type Row = Record<string, any>;

const state: { role: MisRoleName | null; calls: Record<string, Row[]>; total: number } = { role: 'OWNER', calls: {}, total: 61 };
const note = (name: string, args: Row) => { (state.calls[name] ??= []).push(args); };
const model = (name: string) => ({
  findMany: async (a: Row) => { note(`${name}.findMany`, a); return [{ id: `${name}-1`, status: 'MATCHED', supplier: null, po: { poNumber: 'PO-1' }, grn: null, items: [], actor: null, entity: 'order', ...a }]; },
  count: async (a: Row) => { note(`${name}.count`, a); return state.total; },
  groupBy: async () => [{ status: 'MATCHED', _count: { _all: 4 } }],
});

vi.mock('@/server/mis/auth', () => ({
  requirePermission: vi.fn(async (action: MisAction) => {
    if (!state.role || !can(state.role, action)) throw new Error(`forbidden:${action}`);
    return { userId: 'u1', role: state.role };
  }),
  MisForbiddenError: class extends Error {},
}));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/server/mis/visibility', () => ({
  resolveVisibleEmployeeWhere: vi.fn(async () => ({ managerId: 'pool-root' })),
  wouldCreateManagerCycle: vi.fn(),
  isPoolScoped: vi.fn(),
}));
vi.mock('@/server/mis/store-books', () => ({ storeFactoryZone: async () => 'Asia/Kolkata' }));
vi.mock('@/server/db', () => ({
  db: {
    misPurchaseOrder: model('po'),
    misGrn: model('grn'),
    misOrder: model('order'),
    misEmployee: model('employee'),
    misItem: model('item'),
    misSupplierInvoice: model('invoice'),
    misStoreTransaction: model('txn'),
    misAuditLog: { ...model('audit'), findMany: async (a: Row) => { note('audit.findMany', a); return a.distinct ? [{ entity: 'order' }] : []; } },
    $queryRaw: async () => [{ n: 3 }],
  },
}));

const { listPOsPage } = await import('@/server/mis/po');
const { listGRNsPage } = await import('@/server/mis/grn');
const { listOrdersPage } = await import('@/server/mis/orders');
const { listEmployeesPage } = await import('@/server/mis/employee');
const { getInventoryPage } = await import('@/server/mis/inventory');
const { listSupplierInvoicesPage } = await import('@/server/mis/supplier-invoice');
const { listAllStoreTxnsPage } = await import('@/server/mis/store');
const { listAuditPage } = await import('@/server/mis/audit-list');

beforeEach(() => { state.role = 'OWNER'; state.calls = {}; state.total = 61; });

const first = (key: string) => state.calls[key][0];

describe('list functions return { rows, total } and page by 25', () => {
  it.each([
    ['listPOsPage', () => listPOsPage({ page: '3' }), 'po'],
    ['listGRNsPage', () => listGRNsPage({ page: '3' }), 'grn'],
    ['listOrdersPage', () => listOrdersPage({ page: '3' }), 'order'],
    ['listEmployeesPage', () => listEmployeesPage({ page: '3' }), 'employee'],
    ['getInventoryPage', () => getInventoryPage({ page: '3' }), 'item'],
    ['listSupplierInvoicesPage', () => listSupplierInvoicesPage({ page: '3' }), 'invoice'],
    ['listAllStoreTxnsPage', () => listAllStoreTxnsPage({ page: '3' }), 'txn'],
    ['listAuditPage', () => listAuditPage({ page: '3' }), 'audit'],
  ] as const)('%s', async (_n, call, key) => {
    const out = await call();
    expect(out.total).toBe(61);
    expect(Array.isArray(out.rows)).toBe(true);
    expect(first(`${key}.findMany`)).toMatchObject({ skip: 50, take: 25 });
    expect(first(`${key}.count`)).toBeDefined();
  });

  it('page 1 / junk page start at the top', async () => {
    await listPOsPage({ page: 'zzz' });
    expect(first('po.findMany')).toMatchObject({ skip: 0, take: 25 });
  });
});

describe('search is a server-side where, and filters are kept', () => {
  it('PO: number or supplier; the count uses the same where', async () => {
    await listPOsPage({ q: ' acme ' });
    const where = first('po.findMany').where;
    expect(JSON.stringify(where)).toContain('"contains":"acme"');
    expect(first('po.count').where).toEqual(where);
  });
  it('GRN: number, PO or supplier', async () => {
    await listGRNsPage({ q: 'g-1' });
    expect(first('grn.findMany').where.OR).toHaveLength(3);
  });
  it('Orders: customer filter and search together', async () => {
    await listOrdersPage({ q: 'box', customerId: 'c1' });
    expect(first('order.findMany').where).toMatchObject({ customerId: 'c1', OR: expect.any(Array) });
  });
  it('Supplier invoices: status + search, with per-status counts over the search only', async () => {
    const out = await listSupplierInvoicesPage({ status: 'DISCREPANCY_PRICE', q: 'inv' });
    expect(first('invoice.findMany').where).toMatchObject({ status: 'DISCREPANCY_PRICE', OR: expect.any(Array) });
    expect(out.counts.MATCHED).toBe(4);
    expect(out.counts.DISCREPANCY_PRICE).toBe(0);
  });
  it('Store transactions: type, item, search', async () => {
    await listAllStoreTxnsPage({ type: 'IN', itemId: 'i1', q: 'ref' });
    expect(first('txn.findMany').where).toMatchObject({ type: 'IN', itemId: 'i1', OR: expect.any(Array) });
  });
  it('Audit: entity + search', async () => {
    const out = await listAuditPage({ entity: 'order', q: 'create' });
    expect(first('audit.findMany').where).toMatchObject({ entity: 'order', OR: expect.any(Array) });
    expect(out.entities).toEqual(['order']);
  });
  it('Inventory: whole-list out-of-stock count rides along', async () => {
    const out = await getInventoryPage({ q: 'kraft' });
    expect(out.outOfStock).toBe(3);
    expect(first('item.findMany').where.OR).toHaveLength(2);
  });
});

describe('permission scoping survives paging', () => {
  it('employees: the pool scope is in the where of both the page and the total', async () => {
    await listEmployeesPage({ q: 'ram' });
    const w = JSON.stringify(first('employee.findMany').where);
    expect(w).toContain('pool-root');
    expect(w).toContain('"deletedAt":null');
    expect(first('employee.count').where).toEqual(first('employee.findMany').where);
  });

  it.each([
    ['listPOsPage', () => listPOsPage(), 'WORKER'],
    ['listGRNsPage', () => listGRNsPage(), 'WORKER'],
    ['listOrdersPage', () => listOrdersPage(), 'WORKER'],
    ['listEmployeesPage', () => listEmployeesPage(), 'WORKER'],
    ['getInventoryPage', () => getInventoryPage(), 'WORKER'],
    ['listSupplierInvoicesPage', () => listSupplierInvoicesPage(), 'QC'],
    ['listAllStoreTxnsPage', () => listAllStoreTxnsPage(), 'WORKER'],
    ['listAuditPage', () => listAuditPage(), 'STORE_GUY'],
  ] as const)('%s refuses a role without the read permission and queries nothing', async (_n, call, role) => {
    state.role = role;
    await expect(call()).rejects.toThrow(/forbidden:/);
    expect(Object.keys(state.calls)).toHaveLength(0);
  });

  it('supplier invoices: a Store Guy page carries status only, no figures or money', async () => {
    state.role = 'STORE_GUY';
    const out = await listSupplierInvoicesPage();
    expect(out.rows[0]).not.toHaveProperty('figures');
    expect(out.rows[0]).not.toHaveProperty('money');
  });
});
