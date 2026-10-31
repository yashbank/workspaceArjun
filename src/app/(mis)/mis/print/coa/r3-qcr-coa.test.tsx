/**
 * R3-QCR B74 (verdict = latest per stage+parameter), B75 (load error reaches the boundary),
 * B81 (factory dates, order status, DRAFT banner).
 */
import { render, screen } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireMisAccess = vi.fn(async () => ({ id: 'u1' }));
const getOrder = vi.fn();
const getQcForOrder = vi.fn();

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: () => requireMisAccess() }));
vi.mock('@/server/mis/orders', () => ({ getOrder: () => getOrder() }));
vi.mock('@/server/mis/qc', () => ({ getQcForOrder: () => getQcForOrder() }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));
// R2-46: the page reads its document version and draws the version strip.
vi.mock('@/server/mis/document-versions', () => ({ getDocumentVersionView: async () => ({ docType: 'COA', refId: 'x', versions: [], latest: null, canPrepare: false }) }));
vi.mock('@/components/mis/print/document-version-bar', () => ({ DocumentVersionBar: () => null }));
vi.mock('@/server/mis/production', () => ({ getLastProductionAt: async () => null })); // R2-316 plumbing

const { default: CoaPrintPage } = await import('./[id]/page');
const { default: CoaError } = await import('./[id]/error');

const ORDER_ID = '3f2b8c1e-9a4d-4e6b-8c7a-1d5e0f9a2b34';
const page = () => CoaPrintPage({ params: Promise.resolve({ id: ORDER_ID }) });
const orderWith = (status: string) => ({ id: ORDER_ID, orderNumber: 'ORD-118', status, description: 'Duplex', deliveryDate: new Date('2026-10-20T00:00:00Z'), customer: { name: 'Acme' } });
const at = (hhmm: string) => new Date(`2026-09-05T${hhmm}:00+05:30`);
const chk = (id: string, result: string, hhmm: string, parameterName = 'Shade', bomStageId: string | null = null) =>
  ({ id, result, parameterName, bomStageId, defectType: null, notes: null, checkTime: at(hhmm), checkBy: null });

function textContent(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (isValidElement(node)) return textContent((node.props as { children?: ReactNode }).children);
  return '';
}

beforeEach(() => {
  vi.clearAllMocks();
  getOrder.mockResolvedValue(orderWith('COMPLETED'));
  getQcForOrder.mockResolvedValue([]);
});

describe('B74 overall result', () => {
  it('a FAIL at 09:15 followed by a PASS at 10:15 on the same stage + parameter prints PASS', async () => {
    getQcForOrder.mockResolvedValue([chk('c2', 'PASS', '10:15'), chk('c1', 'FAIL', '09:15')]);
    const text = textContent(await page());
    expect(text).toMatch(/Overall Result\s+PASS/);
    expect(text).not.toMatch(/Overall Result\s+FAIL/);
  });

  it('a FAIL on parameter A plus a PASS on parameter B prints FAIL', async () => {
    getQcForOrder.mockResolvedValue([chk('c1', 'FAIL', '09:15', 'A'), chk('c2', 'PASS', '10:15', 'B')]);
    expect(textContent(await page())).toMatch(/Overall Result\s+FAIL/);
  });

  it('no checks reads "N/A — no checks recorded"', async () => {
    expect(textContent(await page())).toContain('N/A — no checks recorded');
  });

  it('only N/A checks reads N/A', async () => {
    getQcForOrder.mockResolvedValue([chk('c1', 'NA', '09:15')]);
    expect(textContent(await page())).toMatch(/Overall Result\s+N\/A(?! —)/);
  });
});

describe('B75 a load error is never printed as "no checks"', () => {
  it('a QC load failure propagates out of the page instead of becoming an empty list', async () => {
    getQcForOrder.mockRejectedValue(new Error('db down'));
    await expect(page()).rejects.toThrow('db down');
  });

  it('the error boundary tells the reader not to issue the certificate', () => {
    render(<CoaError error={new Error('db down')} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load QC data — do not issue this certificate');
    expect(document.body.textContent).not.toContain('No quality checks recorded');
  });
});

describe('B81 content', () => {
  it('dates use the factory zone (dd/mm/yyyy), not the browser locale', async () => {
    getQcForOrder.mockResolvedValue([chk('c1', 'PASS', '23:45')]); // 23:45 IST on 5 Sep = 18:15Z
    const text = textContent(await page());
    expect(text).toContain('05/09/2026 23:45');
    expect(text).toContain('20/10/2026'); // delivery date
  });

  // R2-338: a CoA may be approved from IN_PRODUCTION on, so that status is no longer a draft.
  it.each(['DRAFT', 'CONFIRMED', 'CANCELLED', 'QC_PENDING'])('status %s shows the red DRAFT banner naming the status', async (status) => {
    getOrder.mockResolvedValue(orderWith(status));
    expect(textContent(await page())).toContain(`DRAFT CERTIFICATE — order is ${status}`);
  });

  it.each(['IN_PRODUCTION' /* R2-338 */, 'COMPLETED', 'DELIVERED'])('status %s shows no draft banner', async (status) => {
    getOrder.mockResolvedValue(orderWith(status));
    expect(textContent(await page())).not.toContain('DRAFT CERTIFICATE');
  });
});
