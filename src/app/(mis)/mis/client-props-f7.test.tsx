/**
 * F7 — a Prisma Decimal must not reach a Client Component from order detail, the machine board, the machines
 * master, the QC hourly grid or the GRN list (the browser logged "Decimal objects are not supported" on the first
 * two). Same detector as `client-props.test.tsx`; each page is fed Decimal-bearing rows and the props it hands the
 * screen are walked. Order detail is also run as a non-Owner, with the REAL `getBom`, to prove the BOM rate is
 * absent from the props rather than merely converted.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class Dec {
  constructor(private n: number) {}
  toNumber() { return this.n; }
  toString() { return String(this.n); }
}
const d = (n: number) => new Dec(n);

const state = vi.hoisted(() => ({ role: 'OWNER' as string }));

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => state.role }));
vi.mock('@/server/mis/auth', () => ({
  requirePermission: async () => ({ userId: 'u1', role: state.role }),
  checkPermission: async () => true,
}));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const bomRow = {
  id: 'b1', orderId: 'o1', status: 'APPROVED',
  stages: [{ id: 's1', seq: 0, process: { name: 'Print' }, materials: [{ id: 'm1', stageId: 's1', description: 'Ink', itemId: 'i1', quantity: d(2), unit: 'KG', ratePerUnit: d(450), seq: 0, item: { name: 'Ink', unit: 'KG' } }] }],
};
vi.mock('@/server/db', () => ({
  db: {
    misBom: { findUnique: async () => bomRow },
    misQcCheck: { findMany: async () => [{ id: 'q1', defectQty: new (class Decimal { toNumber() { return 3; } })(), order: { orderNumber: 'ORD-1' } }] },
  },
}));

const ORDER = { id: '00000000-0000-4000-8000-000000000001', orderNumber: 'ORD-1', status: 'CONFIRMED', customer: { name: 'C' } };
vi.mock('@/server/mis/orders', () => ({
  getOrder: async () => ORDER,
  listOrders: async () => [{ id: 'o1', orderNumber: 'ORD-1', status: 'IN_PRODUCTION' }],
}));
vi.mock('@/server/mis/production', () => ({ getProductionForOrder: async () => [], getProductionSummary: async () => ({ totalProduced: 0, totalWaste: 0, entries: 0 }) }));
vi.mock('@/server/mis/job-phases', () => ({ getPhasesForOrder: async () => [] }));
vi.mock('@/server/mis/qc', () => ({ getQcForOrder: async () => [], getQcSummary: async () => ({ total: 0, pass: 0, fail: 0 }) }));
vi.mock('@/server/mis/documents', () => ({ listDocuments: async () => [] }));
vi.mock('@/server/mis/order-desktop', () => ({ getOrderDesktopView: async () => null }));
vi.mock('@/server/mis/order-allocation', () => ({ getOrderAllocations: async () => [] }));

const machine = { id: 'mc1', code: 'M1', name: 'Press', isActive: true, capacityPerDay: d(5000), department: { id: 'd1', name: 'Print' } };
vi.mock('@/server/mis/machines-board', () => ({
  getMachineBoard: async () => [{ ...machine, status: 'FREE', currentAllocation: null }],
  getMachineDayTimeline: async () => null,
}));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/server/mis/machine', () => ({ listMachines: async () => [machine] }));
vi.mock('@/server/mis/department', () => ({ listDepts: async () => [] }));
vi.mock('@/server/mis/qc-grid', () => ({ getQcHourlyGrid: async () => null }));
vi.mock('@/server/mis/defect-type', () => ({ listDefectTypes: async () => [] }));
vi.mock('@/server/mis/grn', () => ({ listGRNs: async () => [{ id: 'g1', grnNumber: 'GRN-1', supplierInvoiceAmount: d(1200), po: { id: 'p', poNumber: 'PO-1', supplier: { name: 'S' } } }] }));
vi.mock('@/server/mis/po', () => ({ listPOs: async () => [] }));

vi.mock('@/components/mis/orders/order-detail-screen', () => ({ OrderDetailScreen: () => null }));
vi.mock('@/components/mis/desktop/order-detail-desktop', () => ({ OrderDetailDesktop: () => null }));
vi.mock('@/components/mis/desktop/machine-timeline-desktop', () => ({ MachineTimelineDesktop: () => null }));
vi.mock('@/components/mis/machine-board/machine-board-screen', () => ({ MachineBoardScreen: () => null }));
vi.mock('@/components/mis/machines/machine-screen', () => ({ MachineScreen: () => null }));
vi.mock('@/components/mis/desktop/master-data-desktop-server', () => ({ MasterDataDesktopServer: () => null }));
vi.mock('@/components/mis/qc/qc-grid-screen', () => ({ QcGridScreen: () => null }));
vi.mock('@/components/mis/desktop/qc-grid-desktop', () => ({ QcGridDesktop: () => null }));
vi.mock('@/components/mis/grn/grn-list-screen', () => ({ GrnListScreen: () => null }));

/** Every prop of every element in the tree, walked — a class instance anywhere is a failure. */
function classInstances(node: ReactNode, path = 'page'): string[] {
  const found: string[] = [];
  const walk = (v: unknown, at: string) => {
    if (v === null || typeof v !== 'object') return;
    if (v instanceof Date) return;
    if (isValidElement(v)) {
      const props = v.props as Record<string, unknown>;
      for (const [k, p] of Object.entries(props)) if (k !== 'children') walk(p, `${at}.${k}`);
      for (const c of ([] as ReactNode[]).concat((props.children as ReactNode) ?? [])) walk(c, `${at}>`);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}[${i}]`));
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return void found.push(`${at} (${proto.constructor.name})`);
    for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  walk(node, path);
  return found;
}

/** Every object key anywhere in the props. */
function keysIn(node: ReactNode): string[] {
  const keys: string[] = [];
  const walk = (v: unknown) => {
    if (v === null || typeof v !== 'object' || v instanceof Date) return;
    if (isValidElement(v)) {
      const props = v.props as Record<string, unknown>;
      for (const [k, p] of Object.entries(props)) if (k !== 'children') walk(p);
      for (const c of ([] as ReactNode[]).concat((props.children as ReactNode) ?? [])) walk(c);
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    for (const [k, x] of Object.entries(v)) { keys.push(k); walk(x); }
  };
  walk(node);
  return keys;
}
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const orderArgs = () => ({ params: Promise.resolve({ id: ORDER.id }), searchParams: sp() });

beforeEach(() => { state.role = 'OWNER'; });

describe('no Decimal reaches a client screen (F7)', () => {
  it('order detail: the BOM (quantity, ratePerUnit) is plain numbers', async () => {
    const { default: Page } = await import('./orders/[id]/page');
    expect(classInstances(await Page(orderArgs()))).toEqual([]);
  });

  it('order detail: an Owner still gets the rate, as a number, and the figures are unchanged', async () => {
    const { default: Page } = await import('./orders/[id]/page');
    const tree = await Page(orderArgs());
    expect(keysIn(tree)).toContain('ratePerUnit');
    const props = (isValidElement(tree) ? tree.props : {}) as { bom?: { stages: { materials: { quantity: number; ratePerUnit: number }[] }[] } };
    expect(props.bom?.stages[0].materials[0]).toMatchObject({ quantity: 2, ratePerUnit: 450 });
  });

  it.each(['ADMIN', 'SUPERVISOR', 'QC'])('order detail as %s: no rate anywhere in the props and no class instance', async (role) => {
    state.role = role;
    const { default: Page } = await import('./orders/[id]/page');
    const tree = await Page(orderArgs());
    expect(classInstances(tree)).toEqual([]);
    expect(keysIn(tree)).not.toContain('ratePerUnit');
    expect(JSON.stringify(tree)).not.toContain('450');
  });

  it.each(['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'])('machine board as %s', async (role) => {
    state.role = role;
    const { default: Page } = await import('./machine-board/page');
    expect(classInstances(await Page())).toEqual([]);
  });

  it('machines master', async () => {
    const { default: Page } = await import('./masters/machines/page');
    expect(classInstances(await Page({ searchParams: sp({ view: 'classic' }) }))).toEqual([]);
  });

  it('QC hourly grid (phone grid)', async () => {
    const { default: Page } = await import('./qc/grid/page');
    expect(classInstances(await Page({ searchParams: sp({ view: 'classic' }) }))).toEqual([]);
  });

  it('GRN list', async () => {
    const { default: Page } = await import('./grn/page');
    expect(classInstances(await Page())).toEqual([]);
  });
});
