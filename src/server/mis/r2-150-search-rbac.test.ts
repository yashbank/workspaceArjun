/**
 * R2-144/145/150 — the global search engine. Db-free.
 *   R2-145: one search across Orders, Machines, Items, POs, GRNs, Employees.
 *   R2-150 (Critical): each entity type is searched only when the actor holds its own read
 *   permission — a role with none of the relevant permissions gets an empty result, never a
 *   leaked row. No result ever carries a money field.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/flags', () => ({ isMisEnabled: () => true }));

const rows = {
  orders: [{ id: 'o1', orderNumber: 'ORD-202610-00001', description: 'Boxes', customer: { name: 'Acme' } }],
  machines: [{ id: 'm1', code: 'M1', name: 'Polar Cutter' }],
  items: [{ id: 'i1', code: 'KR-120', name: 'Kraft Liner' }],
  pos: [{ id: 'p1', poNumber: 'PO-202610-00001', status: 'DRAFT', supplier: { name: 'Acme Supplies' } }],
  grns: [{ id: 'g1', grnNumber: 'GRN-202610-00001', status: 'DRAFT' }],
  employees: [{ id: 'e1', employeeCode: 'E1', name: 'Ram Kumar' }],
};
vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findMany: async () => rows.orders },
    misMachine: { findMany: async () => rows.machines },
    misItem: { findMany: async () => rows.items },
    misPurchaseOrder: { findMany: async () => rows.pos },
    misGrn: { findMany: async () => rows.grns },
    misEmployee: { findMany: async () => rows.employees },
  },
}));

const { searchMisEntities } = await import('./search');

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('searchMisEntities', () => {
  it('a query under 2 characters returns nothing, for any role', async () => {
    getMisRole.mockResolvedValue('OWNER');
    expect(await searchMisEntities('a')).toEqual([]);
    expect(await searchMisEntities('  ')).toEqual([]);
  });

  it('OWNER sees every entity type', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const out = await searchMisEntities('ac');
    expect(new Set(out.map((r) => r.type))).toEqual(new Set(['order', 'machine', 'item', 'po', 'grn', 'employee']));
  });

  it('R2-150: STORE_GUY has no employees.read — employees are never searched for them, though POs/GRNs are', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    const out = await searchMisEntities('ac');
    const types = new Set(out.map((r) => r.type));
    expect(types.has('employee')).toBe(false);
    expect(types.has('po')).toBe(true);
    expect(types.has('grn')).toBe(true);
  });

  it('R2-150: ATTENDANCE_OPERATOR (employees.read, attendance.* only) sees employees but no orders, POs or GRNs', async () => {
    getMisRole.mockResolvedValue('ATTENDANCE_OPERATOR');
    const out = await searchMisEntities('ac');
    const types = new Set(out.map((r) => r.type));
    expect(types.has('employee')).toBe(true);
    expect(types.has('order')).toBe(false);
    expect(types.has('po')).toBe(false);
    expect(types.has('grn')).toBe(false);
  });

  it('R2-150: QC holds po.view/grn.view (read-only) and sees PO/GRN results, with no money field anywhere in the shape', async () => {
    getMisRole.mockResolvedValue('QC');
    const out = await searchMisEntities('ac');
    const po = out.find((r) => r.type === 'po');
    expect(po).toBeDefined();
    expect(JSON.stringify(out)).not.toMatch(/amount|price|rate|wage|salary/i);
  });

  it('a role with nothing matching (WORKER) gets an empty result, not a thrown error', async () => {
    getMisRole.mockResolvedValue('WORKER');
    expect(await searchMisEntities('acme')).toEqual([]);
  });

  it('every result carries only a title, subtitle and href — never a raw money/rate field', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const out = await searchMisEntities('ac');
    for (const r of out) {
      expect(Object.keys(r).sort()).toEqual(['href', 'id', 'status', 'subtitle', 'title', 'type']); // R2-146: + status, a label never money
    }
  });
});
