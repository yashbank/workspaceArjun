import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R3 B64 follow-up: STORE_GUY holds orders.read only. The order desktop view must skip (not throw on) the sections
 * behind phase/qc/production.read, carry no money, and the pages that touched those reads are guarded with can().
 */

const calls: string[] = [];
const gate = (action: string, name: string, value: unknown) => async () => {
  calls.push(name);
  const { requirePermission } = await import('./auth');
  await requirePermission(action as never);
  return value;
};

vi.mock('@/server/db', () => ({ db: new Proxy({}, { get: () => { throw new Error('no direct db'); } }) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

vi.mock('./orders', () => ({
  getOrder: async () => ({ id: 'o1', orderNumber: 'ORD-1', description: 'Cartons', status: 'IN_PRODUCTION', createdAt: new Date('2026-10-01T00:00:00Z'), deliveryDate: null, customer: { name: 'Acme' } }),
}));
// These mirror the real gates: each throws for a role without its permission.
vi.mock('./job-phases', () => ({
  getPhasesForOrder: (...a: unknown[]) => gate('phase.read', 'getPhasesForOrder', [])(...(a as [])),
  getSignOffSummary: async () => null,
}));
vi.mock('./qc', () => ({ getQcForOrder: () => gate('qc.read', 'getQcForOrder', [])() }));
vi.mock('./production', () => ({ getProductionForOrder: () => gate('production.read', 'getProductionForOrder', [])() }));
vi.mock('./machines-board', () => ({ getOrderSchedule: () => gate('production.read', 'getOrderSchedule', new Map())() }));
vi.mock('./shift-view', () => ({ getFactoryShiftWindow: () => gate('production.read', 'getFactoryShiftWindow', null)() }));
vi.mock('./bom', () => ({
  getBom: async () => ({ status: 'APPROVED', stages: [{ id: 's', materials: [{ id: 'm1', description: 'Ink', quantity: 5, unit: 'Kg' }] }] }),
}));
vi.mock('./documents', () => ({ listDocuments: async () => [] }));
vi.mock('./business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('./order-allocation', () => ({ getOrderAllocations: async () => [] }));

const { getOrderDesktopView } = await import('./order-desktop');

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('getOrderDesktopView for STORE_GUY', () => {
  it('renders without throwing, skips the phase/qc/production sections, and carries no money', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    const view = await getOrderDesktopView('o1', new Date('2026-10-13T06:00:00Z'));
    expect(view).not.toBeNull();
    expect(view!.orderNumber).toBe('ORD-1');
    expect(view!.phases).toEqual([]);
    expect(view!.bom?.items).toHaveLength(1);
    for (const gated of ['getPhasesForOrder', 'getQcForOrder', 'getProductionForOrder', 'getOrderSchedule', 'getFactoryShiftWindow']) {
      expect(calls, gated).not.toContain(gated);
    }
    expect(JSON.stringify(view)).not.toMatch(/ratePerUnit|"rate"|amount|price|₹/i);
  });

  it('a full reader (SUPERVISOR) still gets every section', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    await getOrderDesktopView('o1', new Date('2026-10-13T06:00:00Z'));
    expect(calls).toEqual(expect.arrayContaining(['getPhasesForOrder', 'getQcForOrder', 'getProductionForOrder']));
  });
});

describe('the pages that read gated data are guarded with can()', () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, '../..', p), 'utf8');

  it('order detail page fetches phases only with phase.read and hides the Phases card otherwise', () => {
    const page = read('app/(mis)/mis/orders/[id]/page.tsx');
    expect(page).toMatch(/can\(role, 'phase\.read'\) \? getPhasesForOrder\(id\)/);
    expect(page).toMatch(/showPhases=\{can\(role, 'phase\.read'\)\}/);
    expect(read('components/mis/orders/order-detail-screen.tsx')).toMatch(/\{showPhases && /);
  });

  it('dashboard counts phases only with phase.read', () => {
    expect(read('app/(mis)/mis/dashboard/page.tsx')).toMatch(/can\(role, 'phase\.read'\) \? await countPhasesForOrders/);
  });

  it('customer detail sends a role without masters.read back to the list, and the list hides View for it', () => {
    const detail = read('app/(mis)/mis/customers/[id]/page.tsx');
    expect(detail.indexOf("redirect('/mis/customers')")).toBeGreaterThan(-1);
    expect(detail.indexOf("redirect('/mis/customers')")).toBeLessThan(detail.indexOf("requirePermission('masters.read')"));
    expect(read('app/(mis)/mis/customers/page.tsx')).toMatch(/canView=\{canView\}/);
    expect(read('components/mis/customers/customer-screen.tsx')).toMatch(/\{canView && <Link/);
  });
});
