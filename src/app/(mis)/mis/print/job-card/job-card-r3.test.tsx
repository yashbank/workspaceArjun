/** R3-PRD B124/B125: the BPR shows per-unit totals and a crew line per phase, and never swallows a load error. */
import { readFileSync } from 'node:fs';
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOrder = vi.fn();
const getBom = vi.fn();
const getProductionSummary = vi.fn();
const getPhasesForOrder = vi.fn();
const getCrewForOrder = vi.fn();

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/orders', () => ({ getOrder: () => getOrder() }));
vi.mock('@/server/mis/bom', () => ({ getBom: () => getBom() }));
vi.mock('@/server/mis/production', () => ({ getProductionSummary: () => getProductionSummary() }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/server/mis/job-phases', () => ({ getPhasesForOrder: () => getPhasesForOrder() }));
vi.mock('@/server/mis/worker-allocation', () => ({ getCrewForOrder: () => getCrewForOrder() }));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));
// R2-46: the page reads its document version and draws the version strip.
vi.mock('@/server/mis/document-versions', () => ({ getDocumentVersionView: async () => ({ docType: 'COA', refId: 'x', versions: [], latest: null, canPrepare: false }) }));
vi.mock('@/components/mis/print/document-version-bar', () => ({ DocumentVersionBar: () => null }));

const { default: Page } = await import('./[id]/page');
const ID = '3f2b8c1e-9a4d-4e6b-8c7a-1d5e0f9a2b34';

function text(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (isValidElement(node)) return text((node.props as { children?: ReactNode }).children);
  return '';
}

beforeEach(() => {
  vi.clearAllMocks();
  getOrder.mockResolvedValue({ id: ID, orderNumber: 'ORD-1', description: 'd', status: 'IN_PRODUCTION', deliveryDate: null, notes: null, customer: { name: 'Acme' } });
  getBom.mockResolvedValue(null);
  getProductionSummary.mockResolvedValue({
    totalProduced: 200, totalWaste: 0, entries: 2,
    byUnit: [{ unit: 'KG', produced: 200, waste: 0, wastePercent: 0 }, { unit: 'PIECE', produced: 500, waste: 5, wastePercent: 1 }],
  });
  getPhasesForOrder.mockResolvedValue([
    { id: 'p1', sequence: 1, status: 'IN_PROGRESS', process: { name: 'Coating' }, inCharge: null, startedAt: null, signedOffAt: null, notApplicableReason: null, downstreamFlagged: false },
  ]);
  getCrewForOrder.mockResolvedValue([
    { jobPhaseId: 'p1', phaseName: 'Coating', machineName: 'Coater 1', dateKey: '2026-10-13', shiftName: 'Day', people: [
      { name: 'Asha', employeeCode: 'E1', released: false }, { name: 'Bala', employeeCode: 'E2', released: true },
    ] },
  ]);
});

describe('job card (R3)', () => {
  it('prints a Crew line per phase with names, codes and (released)', async () => {
    const t = text(await Page({ params: Promise.resolve({ id: ID }) }));
    expect(t).toMatch(/Crew\s+—\s+Coating/);
    expect(t).toContain('Asha (E1)');
    expect(t).toContain('Bala (E2) (released)');
    expect(t).toContain('Coater 1');
  });

  it('R2-264 / R2-265: prints the ordered quantity and the Customer PO # when the order carries them', async () => {
    getOrder.mockResolvedValue({ id: ID, orderNumber: 'ORD-1', description: 'd', status: 'IN_PRODUCTION', deliveryDate: null, notes: null, customer: { name: 'Acme' }, quantity: 10000, unit: 'PIECE', customerPoRef: 'PO-AMZ-2026-99' });
    const t = text(await Page({ params: Promise.resolve({ id: ID }) }));
    expect(t).toContain('Customer PO #');
    expect(t).toContain('PO-AMZ-2026-99');
    expect(t).toMatch(/Ordered Quantity\s+10,000 Pieces/);
  });

  it('shows per-unit totals, not one mixed figure or a hard-coded kg', async () => {
    const t = text(await Page({ params: Promise.resolve({ id: ID }) }));
    expect(t).toMatch(/200\s+KG/);
    expect(t).toMatch(/500\s+PIECE/);
    expect(t).not.toMatch(/700/);
    expect(t).not.toMatch(/\skg\b/);
  });

  it('a load error is not swallowed (it reaches error.tsx)', async () => {
    getProductionSummary.mockRejectedValue(new Error('db down'));
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toThrow('db down');
    getProductionSummary.mockResolvedValue({ totalProduced: 0, totalWaste: 0, entries: 0, byUnit: [] });
    getBom.mockRejectedValue(new Error('bom down'));
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toThrow('bom down');
  });

  it('has the error boundary and no toLocale* in the page', () => {
    const dir = 'src/app/(mis)/mis/print/job-card/[id]/';
    expect(readFileSync(dir + 'error.tsx', 'utf8')).toContain('Could not load the batch record — do not print');
    expect(readFileSync(dir + 'page.tsx', 'utf8')).not.toMatch(/toLocale/);
  });
});
