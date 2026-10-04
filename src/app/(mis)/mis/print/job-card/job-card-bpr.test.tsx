/**
 * E6-09 — the Batch Production Record print route.
 *
 * `/mis/print/job-card/[id]` is the BPR print (D9: the order is the job card, there is no
 * separate MisJobCard model). Before this, the page showed BOM stages and three generic
 * blank "Prepared By / Supervisor / QC Sign-off" boxes that had nothing to do with the real
 * per-section sign-off state machine `job-phases.ts` implements (Appendix A). This test
 * guards the page actually renders the work-flow section table from `getPhasesForOrder`,
 * and that an order with no phase plan says so (D10) instead of lying with a blank table.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class NotFound extends Error {}
const notFound = vi.fn(() => {
  throw new NotFound('NEXT_NOT_FOUND');
});
const requireMisAccess = vi.fn(async () => ({ id: 'u1' }));
const getOrder = vi.fn();
const getBom = vi.fn(async () => null);
const getProductionSummary = vi.fn(async () => ({ totalProduced: 0, totalWaste: 0, entries: 0 }));
const getFactoryTimezone = vi.fn(async () => 'Asia/Kolkata');
const getPhasesForOrder = vi.fn(async () => [] as unknown[]);

vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: () => requireMisAccess() }));
vi.mock('@/server/mis/orders', () => ({ getOrder: () => getOrder() }));
vi.mock('@/server/mis/bom', () => ({ getBom: () => getBom() }));
vi.mock('@/server/mis/production', () => ({ getProductionSummary: () => getProductionSummary() }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: () => getFactoryTimezone() }));
vi.mock('@/server/mis/job-phases', () => ({ getPhasesForOrder: () => getPhasesForOrder() }));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));

const { default: JobCardPrintPage } = await import('./[id]/page');

const ORDER_ID = '3f2b8c1e-9a4d-4e6b-8c7a-1d5e0f9a2b34';
const page = (id: string) => JobCardPrintPage({ params: Promise.resolve({ id }) });

function textContent(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (isValidElement(node)) return textContent((node.props as { children?: ReactNode }).children);
  return '';
}

beforeEach(() => {
  vi.clearAllMocks();
  getOrder.mockResolvedValue({
    id: ORDER_ID,
    orderNumber: 'ORD-118',
    description: 'Test order',
    status: 'IN_PRODUCTION',
    deliveryDate: null,
    notes: null,
    customer: { name: 'Acme Co' },
  });
  getBom.mockResolvedValue(null);
  getProductionSummary.mockResolvedValue({ totalProduced: 0, totalWaste: 0, entries: 0 });
  getFactoryTimezone.mockResolvedValue('Asia/Kolkata');
  getPhasesForOrder.mockResolvedValue([]);
});

describe('/mis/print/job-card/[id] — the BPR', () => {
  it.each(['none', 'e1', 'abc', '123', '', "1'; DROP TABLE x;--"])(
    'a non-UUID id (%j) is a 404 and reaches no query, gate or server function',
    async (id) => {
      await expect(page(id)).rejects.toBeInstanceOf(NotFound);
      expect(requireMisAccess).not.toHaveBeenCalled();
      expect(getOrder).not.toHaveBeenCalled();
      expect(getPhasesForOrder).not.toHaveBeenCalled();
    },
  );

  it('an unknown order is a 404', async () => {
    getOrder.mockResolvedValue(null);
    await expect(page(ORDER_ID)).rejects.toBeInstanceOf(NotFound);
  });

  it('an order with no phase plan says so, not a blank table (D10)', async () => {
    getPhasesForOrder.mockResolvedValue([]);
    const tree = await page(ORDER_ID);
    const text = textContent(tree);
    expect(text).toContain('No phase plan · not gated');
    expect(text).not.toContain('Section receiving BPR');
  });

  it('renders every section with its status, in-charge and the BPR\'s own hand-off rule', async () => {
    getPhasesForOrder.mockResolvedValue([
      {
        id: 'p1',
        sequence: 1,
        status: 'SIGNED_OFF',
        process: { name: 'Printing' },
        inCharge: { name: 'Vali Sah' },
        startedAt: new Date('2026-09-20T03:00:00.000Z'),
        signedOffAt: new Date('2026-09-20T05:00:00.000Z'),
        notApplicableReason: null,
        downstreamFlagged: false,
      },
      {
        id: 'p2',
        sequence: 2,
        status: 'IN_PROGRESS',
        process: { name: 'Lamination' },
        inCharge: null,
        startedAt: new Date('2026-09-20T05:30:00.000Z'),
        signedOffAt: null,
        notApplicableReason: null,
        downstreamFlagged: false,
      },
      {
        id: 'p3',
        sequence: 3,
        status: 'NOT_APPLICABLE',
        process: { name: 'Foiling' },
        inCharge: null,
        startedAt: null,
        signedOffAt: null,
        notApplicableReason: 'Not on this job card',
        downstreamFlagged: false,
      },
    ]);

    const tree = await page(ORDER_ID);
    const text = textContent(tree);

    expect(text).toContain('Batch Production Record');
    expect(text).toContain('Printing');
    expect(text).toContain('Signed off');
    expect(text).toContain('Vali Sah');
    expect(text).toContain('Lamination');
    expect(text).toContain('In progress');
    expect(text).toContain('Not assigned');
    expect(text).toContain('Foiling');
    expect(text).toContain('Not on this job card');
    expect(text).toContain('Section receiving BPR should not accept BPR if it is not signed by previous section.');
  });

  it('a reopened downstream phase is flagged on the printed record', async () => {
    getPhasesForOrder.mockResolvedValue([
      {
        id: 'p1',
        sequence: 1,
        status: 'IN_PROGRESS',
        process: { name: 'Die Cutting' },
        inCharge: { name: 'Ramesh' },
        startedAt: new Date('2026-09-20T03:00:00.000Z'),
        signedOffAt: null,
        notApplicableReason: null,
        downstreamFlagged: true,
      },
    ]);
    const text = textContent(await page(ORDER_ID));
    expect(text).toContain('an earlier section was reopened after this one started');
  });
});
