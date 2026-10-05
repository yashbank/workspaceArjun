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
    expect(text).toContain('5/9/2026'); // en-IN, unpadded — the real fix is that this is a real date, not "Invalid Date"
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
    expect(text).toMatch(/Fail:\s*1/);
  });

  it('no QC checks recorded says so, not a blank table', async () => {
    getQcForOrder.mockResolvedValue([]);
    const tree = await page(ORDER_ID);
    expect(textContent(tree)).toContain('No quality checks recorded.');
  });
});
