/**
 * MIS V2 — every new server page renders for its role with realistic (Decimal-bearing) rows and
 * hands only plain data to its client screen. Same approach as client-props.test.tsx: the server
 * functions are mocked, the page runs for real, and a class instance in any prop is a failure.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class Dec { constructor(private n: number) {} toNumber() { return this.n; } toString() { return String(this.n); } }
const d = (n: number) => new Dec(n);
const ID = '00000000-0000-4000-8000-00000000000a';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1', name: 'Owner', email: 'o@x' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('@/server/mis/auth', () => ({ checkPermission: async () => true, requirePermission: async () => ({ userId: 'u1', role: 'OWNER' }) }));

const request = { id: ID, requestNumber: 'MRN-1', status: 'PENDING', createdAt: new Date(), notes: null, decisionNote: null, order: null, department: { id: 'd', name: 'Print' }, lines: [{ id: 'l1', requestedQty: d(5), actualIssuedQty: null, item: { id: 'i', code: 'K', name: 'Kraft', unit: 'KG', category: 'RAW_MATERIAL' } }] };
vi.mock('@/server/mis/material-request', () => ({ listMaterialRequests: async () => [request], getMaterialRequest: async () => request }));
vi.mock('@/server/mis/store', () => ({ listPickerItems: async () => [{ id: 'i', code: 'K', name: 'Kraft', unit: 'KG', balance: 3 }], listIssueTargets: async () => ({ orders: [], departments: [] }) }));
const template = { id: ID, name: 'Printing 6-Colours', processName: 'Printing', slotStart: '09:15', slotEnd: '18:00', parameters: ['Shade'], slots: ['09:15', '10:00'], isActive: true, sortOrder: 0 };
vi.mock('@/server/mis/qc-template', () => ({ listQcTemplates: async () => [template] }));
vi.mock('@/server/mis/orders', () => ({ getOrder: async () => ({ id: ID, orderNumber: 'ORD-1', customer: { name: 'C' } }) }));
vi.mock('@/server/mis/qc', () => ({ getQcForOrder: async () => [{ id: 'c', parameterName: 'Shade', slotTime: '09:15', templateId: ID, result: 'PASS', defectType: null, checkTime: new Date(), defectQty: d(0) }] }));

vi.mock('@/components/mis/store/request-list-screen', () => ({ RequestListScreen: () => null, STATUS_TONE: {} }));
vi.mock('@/components/mis/store/request-detail-screen', () => ({ RequestDetailScreen: () => null }));
vi.mock('@/components/mis/store/request-screen', () => ({ RequestScreen: () => null }));
vi.mock('@/components/mis/settings/qc-template-settings-screen', () => ({ QcTemplateSettingsScreen: () => null }));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));

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
const params = Promise.resolve({ id: ID });

beforeEach(() => vi.clearAllMocks());

describe('V2 pages render and pass only plain data to the client', () => {
  it('material requests list', async () => {
    const { default: Page } = await import('./store/requests/page');
    expect(classInstances(await Page())).toEqual([]);
  });
  it('material request detail', async () => {
    const { default: Page } = await import('./store/requests/[id]/page');
    expect(classInstances(await Page({ params }))).toEqual([]);
  });
  it('new material request', async () => {
    const { default: Page } = await import('./store/requests/new/page');
    expect(classInstances(await Page())).toEqual([]);
  });
  it('QC template settings', async () => {
    const { default: Page } = await import('./settings/qc-templates/page');
    expect(classInstances(await Page())).toEqual([]);
  });
  it('QC checklist A4 print renders the slot columns and the tapped cell', async () => {
    const { default: Page } = await import('./print/qc-checklist/[id]/page');
    const tree = await Page({ params, searchParams: Promise.resolve({ template: ID }) });
    expect(classInstances(tree)).toEqual([]);
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(tree as React.ReactElement);
    expect(html).toContain('09:15');
    expect(html).toContain('Shade');
    expect(html).toContain('✓');
  });
  it('a bad id on the request detail is a 404, not a query', async () => {
    const { default: Page } = await import('./store/requests/[id]/page');
    await expect(Page({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
