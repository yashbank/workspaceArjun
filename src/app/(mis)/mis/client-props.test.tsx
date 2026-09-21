/**
 * Phase 24F · F-24 — a Prisma Decimal must not reach a Client Component.
 *
 * Found in the browser: the GRN detail page crashed ("v.toNumber is not a function") and the BOM, PO, item-master and
 * reports pages logged "Only plain objects can be passed to Client Components ... Decimal objects are not supported"
 * (what arrives is an empty shell, so a screen that calls `toNumber` crashes and arithmetic shows NaN).
 *
 * For each page this feeds the server function a row whose numbers are Decimal-like CLASS INSTANCES, exactly what Prisma
 * returns, and asserts that nothing handed to the screen is a class instance. It fails without `toPlain` on the page.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class Dec {
  constructor(private n: number) {}
  toNumber() { return this.n; }
  toString() { return String(this.n); }
}
const d = (n: number) => new Dec(n);

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('@/server/mis/auth', () => ({ checkPermission: async () => true }));

const grn = { id: 'g1', grnNumber: 'GRN-1', receivedAt: new Date('2026-09-01'), items: [{ id: 'gi', receivedQty: d(5), poItem: { id: 'p', quantity: d(9), item: { id: 'i', name: 'Ink' } } }], po: { id: 'po', items: [{ id: 'p', quantity: d(9), receivedQuantity: d(1), ratePerUnit: d(3) }] } };
vi.mock('@/server/mis/grn', () => ({ getGRN: async () => grn }));

const po = { id: 'po1', poNumber: 'PO-1', items: [{ id: 'p', description: 'x', quantity: d(9), receivedQuantity: d(1), ratePerUnit: d(3), item: { id: 'i', name: 'Ink' } }] };
vi.mock('@/server/mis/po', () => ({ getPO: async () => po, computePoTotal: async () => 27, formatMoney: (v: unknown) => `₹${v}` }));
const catalog = [{ id: 'i', code: 'C', name: 'Ink', unit: 'KG', pricePerUnit: d(50), reorderLevel: d(5) }];
vi.mock('@/server/mis/item', () => ({ listItems: async () => catalog }));

const bom = { id: 'b1', stages: [{ id: 's', materials: [{ id: 'm', quantity: d(2), ratePerUnit: d(4), item: { id: 'i', name: 'Ink', pricePerUnit: d(50) } }] }] };
vi.mock('@/server/mis/bom', () => ({ getBom: async () => bom }));
vi.mock('@/server/mis/bom-desktop', () => ({ getBomDesktopView: async () => null }));

const reportRows = { rows: [{ qtyProduced: d(10), qtyWaste: d(1) }] };
vi.mock('@/server/mis/reports', () => ({
  getProductionReport: async () => reportRows, getAttendanceReport: async () => ({ rows: [] }), getQcReport: async () => ({ rows: [{ defectQty: d(2) }] }),
  getOrdersReport: async () => [{ id: 'o', qty: d(3) }], getStoreReport: async () => ({ raw: [{ quantity: d(4), balanceQty: d(6) }] }), getWastageReport: async () => null,
}));
vi.mock('@/lib/mis/wastage', () => ({ clampWeeks: () => 4 }));

vi.mock('@/components/mis/grn/grn-detail-screen', () => ({ GrnDetailScreen: () => null }));
vi.mock('@/components/mis/bom/bom-screen', () => ({ BomScreen: () => null }));
vi.mock('@/components/mis/desktop/bom-desktop', () => ({ BomDesktop: () => null }));
vi.mock('@/components/mis/po/po-detail-screen', () => ({ PoDetailScreen: () => null }));
vi.mock('@/components/mis/items/item-screen', () => ({ ItemScreen: () => null }));
vi.mock('@/components/mis/reports/reports-screen', () => ({ ReportsScreen: () => null }));
vi.mock('@/components/mis/desktop/wastage-desktop', () => ({ WastageDesktop: () => null }));
vi.mock('@/components/mis/desktop/master-data-desktop-server', () => ({ MasterDataDesktopServer: () => null }));

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
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

beforeEach(() => vi.clearAllMocks());

describe('no Decimal reaches a client screen', () => {
  it('GRN detail', async () => {
    const { default: Page } = await import('./grn/[id]/page');
    expect(classInstances(await Page({ params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) }))).toEqual([]);
  });

  it('PO detail', async () => {
    const { default: Page } = await import('./po/[id]/page');
    expect(classInstances(await Page({ params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000002' }) }))).toEqual([]);
  });

  it('BOM detail', async () => {
    const { default: Page } = await import('./bom/[orderId]/page');
    expect(classInstances(await Page({ params: Promise.resolve({ orderId: '00000000-0000-4000-8000-000000000003' }), searchParams: sp() }))).toEqual([]);
  });

  it('item master', async () => {
    const { default: Page } = await import('./masters/items/page');
    expect(classInstances(await Page({ searchParams: sp({ view: 'classic' }) }))).toEqual([]);
  });

  it('reports', async () => {
    const { default: Page } = await import('./reports/page');
    expect(classInstances(await Page({ searchParams: sp({ view: 'classic' }) }))).toEqual([]);
  });

  it('the detector itself catches a Decimal (so the tests above cannot pass vacuously)', () => {
    expect(classInstances({ type: 'x', props: {} } as unknown as ReactNode)).toEqual([]);
    const el = { $$typeof: Symbol.for('react.transitional.element'), type: 'div', props: { grn: { q: d(1) } }, key: null, ref: null };
    expect(classInstances(el as unknown as ReactNode)).toEqual(['page.grn.q (Dec)']);
  });
});
