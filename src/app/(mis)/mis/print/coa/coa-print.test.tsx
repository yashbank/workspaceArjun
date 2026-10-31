/**
 * E7-07 — the Certificate of Analysis print route.
 *
 * `getQcForOrder`'s rows carry `checkTime`/`checkBy`/`defectType`+`notes` (`qc.ts`'s own types).
 * This page was reading `checkedAt`/`checkedBy`/`defectDescription` instead — fields that do not
 * exist on the row at all — so on EVERY COA ever printed, the Date column showed "Invalid Date"
 * and the Checked By and Notes/Defect columns showed "—" regardless of what was actually
 * recorded. This test pins the real field names.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class NotFound extends Error {}
const notFound = vi.fn(() => {
  throw new NotFound('NEXT_NOT_FOUND');
});
const requireMisAccess = vi.fn(async () => ({ id: 'u1' }));
const getOrder = vi.fn();
const getQcForOrder = vi.fn(async () => [] as unknown[]);

vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: () => requireMisAccess() }));
vi.mock('@/server/mis/orders', () => ({ getOrder: () => getOrder() }));
vi.mock('@/server/mis/qc', () => ({ getQcForOrder: () => getQcForOrder() }));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));
// R2-46: the page reads its document version and draws the version strip.
// R2-294 plumbing: the version list and the frozen copy are configurable per test.
const versionView = vi.fn(async () => ({ docType: 'COA', refId: 'x', versions: [] as unknown[], latest: null as unknown, canPrepare: false }));
const versionSnapshot = vi.fn(async () => null as unknown);
vi.mock('@/server/mis/document-versions', () => ({ getDocumentVersionView: () => versionView(), getDocumentVersionSnapshot: () => versionSnapshot() }));
// R2-316 plumbing: the manufacturing date is the last production entry.
const lastProductionAt = vi.fn(async () => null as Date | null);
vi.mock('@/server/mis/production', () => ({ getLastProductionAt: () => lastProductionAt() }));
vi.mock('@/components/mis/print/document-version-bar', () => ({ DocumentVersionBar: () => null }));
// R3-QCR B81: the page formats dates in the factory's zone, so it now reads the timezone rule.
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));

const { default: CoaPrintPage } = await import('./[id]/page');

const ORDER_ID = '3f2b8c1e-9a4d-4e6b-8c7a-1d5e0f9a2b34';
const page = (id: string) => CoaPrintPage({ params: Promise.resolve({ id }) });

function textContent(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (isValidElement(node)) return textContent((node.props as { children?: ReactNode }).children);
  return '';
}

beforeEach(() => {
  vi.clearAllMocks();
  getOrder.mockResolvedValue({ id: ORDER_ID, orderNumber: 'ORD-118', description: 'Duplex carton', deliveryDate: null, customer: { name: 'Acme Co' } });
  getQcForOrder.mockResolvedValue([]);
});

describe('/mis/print/coa/[id]', () => {
  it.each(['none', 'e1', 'abc', '', "1'; DROP TABLE x;--"])(
    'a non-UUID id (%j) is a 404 and reaches no query or gate',
    async (id) => {
      await expect(page(id)).rejects.toBeInstanceOf(NotFound);
      expect(requireMisAccess).not.toHaveBeenCalled();
      expect(getOrder).not.toHaveBeenCalled();
    },
  );

  it('an unknown order is a 404', async () => {
    getOrder.mockResolvedValue(null);
    await expect(page(ORDER_ID)).rejects.toBeInstanceOf(NotFound);
  });

  it('a PASS row shows who checked it and when — not "—" and "Invalid Date"', async () => {
    getQcForOrder.mockResolvedValue([
      { id: 'c1', parameterName: 'Shade', result: 'PASS', defectType: null, notes: null, checkTime: new Date('2026-09-05T04:30:00.000Z'), checkBy: { name: 'A. Bhaskar' } },
    ]);
    const tree = await page(ORDER_ID);
    const text = textContent(tree);
    expect(text).toContain('A. Bhaskar');
    // R3-QCR B81 changed this contract: factory-zone `dd/mm/yyyy hh:mm` (04:30Z = 10:00 IST), not browser-locale `5/9/2026`.
    expect(text).toContain('05/09/2026 10:00');
    expect(text).not.toContain('Invalid Date');
  });

  it('a FAIL row shows the defect type and notes together, not blank', async () => {
    getQcForOrder.mockResolvedValue([
      { id: 'c1', parameterName: 'Tear strength', result: 'FAIL', defectType: 'TEAR', notes: 'Edge split on roll 3', checkTime: new Date('2026-09-05T04:30:00.000Z'), checkBy: { name: 'A. Bhaskar' } },
    ]);
    const tree = await page(ORDER_ID);
    const text = textContent(tree);
    expect(text).toContain('TEAR');
    expect(text).toContain('Edge split on roll 3');
  });

  it('a check with no checker recorded reads "—", not a crash', async () => {
    getQcForOrder.mockResolvedValue([
      { id: 'c1', parameterName: 'Moisture', result: 'PASS', defectType: null, notes: null, checkTime: new Date('2026-09-05T04:30:00.000Z'), checkBy: null },
    ]);
    const tree = await page(ORDER_ID);
    expect(textContent(tree)).toContain('—');
  });

  it('the overall result and pass/fail counts are correct across several checks', async () => {
    getQcForOrder.mockResolvedValue([
      { id: 'c1', parameterName: 'Shade', result: 'PASS', defectType: null, notes: null, checkTime: new Date('2026-09-05T04:00:00.000Z'), checkBy: null },
      { id: 'c2', parameterName: 'GSM', result: 'FAIL', defectType: 'WEIGHT', notes: null, checkTime: new Date('2026-09-05T05:00:00.000Z'), checkBy: null },
    ]);
    const tree = await page(ORDER_ID);
    const text = textContent(tree);
    expect(text).toContain('FAIL'); // overall result, since at least one check failed
    expect(text).toMatch(/Pass:\s*1/);
    expect(text).toMatch(/Unresolved failures:\s*1/); // R2-315: the summary counts unresolved failures, not every historic FAIL
  });

  it('no QC checks recorded says so, not a blank table', async () => {
    getQcForOrder.mockResolvedValue([]);
    const tree = await page(ORDER_ID);
    expect(textContent(tree)).toContain('No quality checks recorded.');
  });
});

describe('R2-294 / R2-315 / R2-316 — the certificate prints the approved copy, unresolved failures and lot data', () => {
  const live = (id: string, result: string, hhmm: string, parameterName = 'Shade') =>
    ({ id, parameterName, result, defectType: null, notes: null, checkTime: new Date(`2026-09-05T${hhmm}:00+05:30`), checkBy: null });

  it('without ?v= the newest APPROVED version prints its frozen copy, not the newer PREPARED one or live checks', async () => {
    const approved = { id: 'v1', version: 1, status: 'APPROVED', hasSnapshot: true, preparedAt: new Date('2026-09-01T00:00:00Z') };
    const prepared = { id: 'v2', version: 2, status: 'PREPARED', preparedAt: new Date('2026-09-06T00:00:00Z') };
    versionView.mockResolvedValue({ docType: 'COA', refId: 'x', versions: [prepared, approved], latest: prepared, canPrepare: false });
    versionSnapshot.mockResolvedValue({
      kind: 'COA', schema: 1, capturedAt: '2026-09-01T00:00:00.000Z',
      order: { orderNumber: 'ORD-118', status: 'COMPLETED', customerName: 'Acme Co', description: 'Duplex', deliveryDate: null, notes: null },
      qcLogs: [{ id: 'f1', bomStageId: null, parameterName: 'FrozenShade', result: 'PASS', defectType: null, notes: null, checkTime: '2026-09-01T04:00:00.000Z', checkByName: null }],
    });
    getQcForOrder.mockResolvedValue([live('l1', 'FAIL', '10:00', 'LiveUnverified')]);
    const text = textContent(await page(ORDER_ID));
    expect(text).toContain('FrozenShade');
    expect(text).not.toContain('LiveUnverified');
    expect(versionSnapshot).toHaveBeenCalled();
  });

  it('a FAIL re-passed later on the same parameter is not an unresolved failure', async () => {
    getQcForOrder.mockResolvedValue([live('c1', 'FAIL', '09:00'), live('c2', 'PASS', '10:00')]);
    const text = textContent(await page(ORDER_ID));
    expect(text).toMatch(/Unresolved failures:\s*0/);
    expect(text).not.toMatch(/Fail:\s*1/);
  });

  it('prints Batch / Lot No. (the order number), the manufacturing date (last production entry) and the quantity', async () => {
    versionView.mockResolvedValue({ docType: 'COA', refId: 'x', versions: [], latest: null, canPrepare: false }); // live data again
    getOrder.mockResolvedValue({ id: ORDER_ID, orderNumber: 'ORD-118', description: 'Duplex carton', deliveryDate: null, customer: { name: 'Acme Co' }, quantity: 25000, unit: 'PIECE' });
    lastProductionAt.mockResolvedValue(new Date('2026-09-05T10:00:00+05:30'));
    const text = textContent(await page(ORDER_ID));
    expect(text).toContain('Batch / Lot No.');
    expect(text).toContain('Manufacturing Date');
    expect(text).toMatch(/Manufacturing Date\s+05\/09\/2026|Manufacturing Date\s+5 Sep 2026|Manufacturing Date\s+\S*2026/);
    expect(text).toMatch(/Quantity\s+25,000 PIECE|Quantity\s+25000 PIECE|Quantity\s+25,000/);
  });
});
