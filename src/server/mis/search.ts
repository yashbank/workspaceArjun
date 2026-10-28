import { db } from '@/server/db';
import { checkPermission } from './auth';
import { requireMisAccess } from './guard';

export type MisSearchResultType = 'order' | 'machine' | 'item' | 'po' | 'grn' | 'employee';

export type MisSearchResult = {
  type: MisSearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  /** R2-146: a status pill for the row (order/PO/GRN status, ACTIVE/INACTIVE for machines and employees); null for items. Already visible to anyone who may search that type. */
  status: string | null;
  href: string;
};

/** Per entity type, per request — a palette, not a report; five of each is plenty to pick from. */
const PER_TYPE_LIMIT = 5;

/** The query is too short to mean anything and would just return the top N rows of everything. */
const MIN_QUERY_LENGTH = 2;

/** R2-151: nothing useful is longer than this; a 500-char paste is cut, never sent to the database whole. */
export const MAX_QUERY_LENGTH = 100;

const activeLabel = (v: boolean | null | undefined) => (v === true ? 'ACTIVE' : v === false ? 'INACTIVE' : null);

/**
 * R2-145. One search across the factory's core entities (Orders, Machines, Items, Purchase
 * Orders, GRNs, Employees — batches are a GRN line field, `batchNo`, searched as part of GRN).
 *
 * R2-150: each entity type is searched only when the caller holds ITS OWN read permission — a
 * Worker or Operator with no `po.read`/`grn.read` never has purchase orders or receipts searched
 * for them at all, the same gate the PO/GRN list screens already apply. No result ever carries a
 * money field (PO/invoice amounts, wage rates): the search never selects one in the first place,
 * so there is no second field to strip — the same shape the costing and payroll code already uses.
 */
export async function searchMisEntities(query: string): Promise<MisSearchResult[]> {
  await requireMisAccess();
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (q.length < MIN_QUERY_LENGTH) return [];

  const [canOrders, canMasters, canInventory, canPo, canGrn, canEmployees] = await Promise.all([
    checkPermission('orders.read'),
    checkPermission('masters.read'),
    checkPermission('inventory.read'),
    checkPermission('po.read').then(async (ok) => ok || (await checkPermission('po.view'))),
    checkPermission('grn.read').then(async (ok) => ok || (await checkPermission('grn.view'))),
    checkPermission('employees.read'),
  ]);

  const [orders, machines, items, pos, grns, employees] = await Promise.all([
    canOrders ? searchOrders(q) : Promise.resolve([]),
    canMasters ? searchMachines(q) : Promise.resolve([]),
    canInventory || canMasters ? searchItems(q) : Promise.resolve([]),
    canPo ? searchPOs(q) : Promise.resolve([]),
    canGrn ? searchGRNs(q) : Promise.resolve([]),
    canEmployees ? searchEmployees(q) : Promise.resolve([]),
  ]);

  return [...orders, ...machines, ...items, ...pos, ...grns, ...employees];
}

async function searchOrders(q: string): Promise<MisSearchResult[]> {
  const rows = await db.misOrder.findMany({
    where: { OR: [{ orderNumber: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] },
    select: { id: true, orderNumber: true, status: true, description: true, customer: { select: { name: true } } },
    take: PER_TYPE_LIMIT,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ type: 'order', id: r.id, title: r.orderNumber, subtitle: r.customer?.name ?? r.description ?? null, status: r.status ?? null, href: `/mis/orders/${r.id}` }));
}

async function searchMachines(q: string): Promise<MisSearchResult[]> {
  const rows = await db.misMachine.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] },
    select: { id: true, code: true, name: true, isActive: true },
    take: PER_TYPE_LIMIT,
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({ type: 'machine', id: r.id, title: r.name, subtitle: r.code, status: activeLabel(r.isActive), href: `/mis/machine-board/${r.id}` }));
}

async function searchItems(q: string): Promise<MisSearchResult[]> {
  const rows = await db.misItem.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] },
    select: { id: true, code: true, name: true },
    take: PER_TYPE_LIMIT,
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({ type: 'item', id: r.id, title: r.name, subtitle: r.code, status: null, href: `/mis/inventory/${r.id}` }));
}

async function searchPOs(q: string): Promise<MisSearchResult[]> {
  const rows = await db.misPurchaseOrder.findMany({
    where: { OR: [{ poNumber: { contains: q, mode: 'insensitive' } }, { supplier: { name: { contains: q, mode: 'insensitive' } } }] },
    select: { id: true, poNumber: true, status: true, supplier: { select: { name: true } } },
    take: PER_TYPE_LIMIT,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ type: 'po', id: r.id, title: r.poNumber, subtitle: r.supplier?.name ?? r.status, status: r.status ?? null, href: `/mis/po/${r.id}` }));
}

async function searchGRNs(q: string): Promise<MisSearchResult[]> {
  const rows = await db.misGrn.findMany({
    where: { OR: [{ grnNumber: { contains: q, mode: 'insensitive' } }, { items: { some: { batchNo: { contains: q, mode: 'insensitive' } } } }] },
    select: { id: true, grnNumber: true, status: true },
    take: PER_TYPE_LIMIT,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ type: 'grn', id: r.id, title: r.grnNumber, subtitle: r.status, status: r.status ?? null, href: `/mis/grn/${r.id}` }));
}

async function searchEmployees(q: string): Promise<MisSearchResult[]> {
  const rows = await db.misEmployee.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { employeeCode: { contains: q, mode: 'insensitive' } }] },
    select: { id: true, employeeCode: true, name: true, isActive: true },
    take: PER_TYPE_LIMIT,
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({ type: 'employee', id: r.id, title: r.name, subtitle: r.employeeCode, status: activeLabel(r.isActive), href: `/mis/employees/${r.id}` }));
}
