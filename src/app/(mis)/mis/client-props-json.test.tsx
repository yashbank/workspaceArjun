/**
 * QA bug 5: /mis/production, /qc, /traceability and /documents logged "Only plain objects can be passed to Client
 * Components". Each page is fed rows holding a Decimal-like class instance and a Date; every prop handed to the screen
 * must survive JSON.parse(JSON.stringify(x)) unchanged (so: no class instance, no Date).
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class Dec {
  constructor(private n: number) {}
  toNumber() { return this.n; }
}
const row = () => ({ id: 'o1', orderNumber: 'ORD-1', description: 'x', status: 'CONFIRMED', quantity: new Dec(5), deliveryDate: new Date('2026-11-01T00:00:00Z'), createdAt: new Date('2026-10-01T00:00:00Z'), customer: { id: 'c', name: 'Acme' }, _count: { productionLogs: 0 } });

vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('@/server/mis/auth', () => ({ requirePermission: async () => ({}), isMisForbiddenError: () => false }));
vi.mock('@/server/mis/orders', () => ({ listOrders: async () => [row()], listQcOrdersPage: async () => ({ rows: [row()], total: 1 }) }));
vi.mock('@/server/mis/defect-type', () => ({ listDefectTypes: async () => [] }));
vi.mock('@/server/mis/master-option', () => ({ listOptions: async () => [] }));
vi.mock('@/server/db', () => ({
  db: { misOrder: { findMany: async () => [row()], count: async () => 1 }, misMachine: { findMany: async () => [] } },
}));
vi.mock('@/components/mis/production/production-screen', () => ({ ProductionScreen: () => null }));
vi.mock('@/components/mis/qc/qc-screen', () => ({ QcScreen: () => null }));
vi.mock('@/components/mis/traceability/traceability-screen', () => ({ TraceabilityScreen: () => null }));
vi.mock('@/components/mis/documents/documents-screen', () => ({ DocumentsScreen: () => null }));
vi.mock('@/components/mis/desktop/traceability-desktop-server', () => ({ TraceabilityDesktopServer: () => null }));
vi.mock('@/components/mis/desktop/documents-desktop-server', () => ({ DocumentsDesktopServer: () => null }));

/** Collects every prop of every element, minus children that are elements themselves (those are walked). */
function props(node: ReactNode, out: Record<string, unknown>[] = []) {
  if (Array.isArray(node)) node.forEach((n) => props(n, out));
  else if (isValidElement(node)) {
    const { children, ...rest } = node.props as Record<string, unknown>;
    out.push(rest);
    props(children as ReactNode, out);
  }
  return out;
}
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const expectJsonPlain = (tree: ReactNode) => {
  const all = props(tree);
  expect(all.length).toBeGreaterThan(0);
  for (const p of all) expect(JSON.parse(JSON.stringify(p))).toEqual(p);
};

beforeEach(() => vi.clearAllMocks());

describe('QA bug 5: nothing but JSON-plain data reaches the client screens', () => {
  it('production', async () => {
    const { default: Page } = await import('./production/page');
    expectJsonPlain(await Page({ searchParams: sp() }));
  });
  it('qc', async () => {
    const { default: Page } = await import('./qc/page');
    expectJsonPlain(await Page({ searchParams: sp() }));
  });
  it('traceability', async () => {
    const { default: Page } = await import('./traceability/page');
    expectJsonPlain(await Page({ searchParams: sp({ view: 'x' }) }));
  });
  it('documents', async () => {
    const { default: Page } = await import('./documents/page');
    expectJsonPlain(await Page({ searchParams: sp({ view: 'x' }) }));
  });
});
