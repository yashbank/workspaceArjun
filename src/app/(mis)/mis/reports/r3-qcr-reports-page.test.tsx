/**
 * R3-QCR B78: one failing report section renders "Could not load <section>" while the others still render.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), notFound: () => { throw new Error('NF'); } }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/components/mis/desktop/wastage-desktop', () => ({ WastageDesktop: () => null }));

const production = vi.fn();
const reports = {
  getProductionReport: (...a: unknown[]) => production(...a),
  getAttendanceReport: async () => ({ rows: [{ name: 'A', code: 'E1', dept: 'P', present: 3, absent: 0, late: 0, ot: 0 }], raw: [] }),
  getQcReport: async () => ({ rows: [], raw: [] }),
  getOrdersReport: async () => [],
  getStoreReport: async () => ({ rows: [], raw: [] }),
  getMachineUtilisationReport: async () => ({ rows: [], availableMinutes: 0, fromIso: '', toIso: '', totals: { bookedMinutes: 0, allocationCount: 0, machineCount: 0 } }),
  getWastageReport: async () => null,
  clampReportMonth: () => ({ year: 2026, month: 10 }),
  factoryMonthRange: () => ({ from: new Date('2026-09-30T18:30:00Z'), to: new Date('2026-10-31T18:30:00Z') }),
};
vi.mock('@/server/mis/reports', () => reports);

const { default: Page } = await import('./page');
const { ReportsScreen } = await import('@/components/mis/reports/reports-screen');

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

beforeEach(() => {
  production.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('reports page sections', () => {
  it('a throwing production report is flagged in `failed`; every other section still carries its data', async () => {
    production.mockRejectedValue(new Error('boom'));
    const tree = (await Page({ searchParams: sp({ view: 'classic' }) })) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(tree)).toBe(true);
    expect(tree.props.failed).toEqual({ production: 'Could not load production' });
    expect((tree.props.attendance as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it('when nothing fails, `failed` is empty', async () => {
    production.mockResolvedValue({ rows: [], totals: [], raw: [] });
    const tree = (await Page({ searchParams: sp({ view: 'classic' }) })) as ReactElement<Record<string, unknown>>;
    expect(tree.props.failed).toEqual({});
  });

  it('a nonsense ?year/?month does not throw (clamped)', async () => {
    production.mockResolvedValue({ rows: [], totals: [], raw: [] });
    await expect(Page({ searchParams: sp({ view: 'classic', year: '99999', month: 'zz' }) })).resolves.toBeTruthy();
  });
});

describe('ReportsScreen', () => {
  const base = {
    production: { rows: [], totals: [], raw: [] },
    attendance: { rows: [{ name: 'Asha', code: 'E1', dept: 'Press', present: 3, absent: 0, late: 0, ot: 0 }], raw: [] },
    qc: { rows: [], raw: [] },
    orders: [],
    store: { rows: [], raw: [] },
    machines: { rows: [], availableMinutes: 0, totals: { bookedMinutes: 0, allocationCount: 0, machineCount: 0 } },
    canSeeWages: false,
    isOwner: false,
    rangeLabel: 'October 2026',
    year: 2026,
    month: 10,
  };

  it('shows "Could not load production" on the failed tab while another tab still renders', () => {
    render(<ReportsScreen {...base} failed={{ production: 'Could not load production' }} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load production');
    fireEvent.click(screen.getByRole('button', { name: 'Attendance' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByText('Asha').length).toBeGreaterThan(0);
  });

  it('prints one figure per unit in the summary, never a mixed total, with the unit on every row', () => {
    render(
      <ReportsScreen
        {...base}
        production={{
          rows: [
            { orderNumber: 'ORD-1', description: null, unit: 'PIECE', produced: 500, waste: 10, entries: 1 },
            { orderNumber: 'ORD-2', description: null, unit: 'KG', produced: 200, waste: 4, entries: 1 },
          ],
          totals: [
            { unit: 'KG', produced: 200, waste: 4, wastePct: 2 },
            { unit: 'PIECE', produced: 500, waste: 10, wastePct: 2 },
          ],
          raw: [],
        }}
      />,
    );
    expect(document.body.textContent).toContain('200 / 500');
    expect(document.body.textContent).not.toContain('700');
    expect(screen.getAllByText(/500 PIECE/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/200 KG/).length).toBeGreaterThan(0);
  });

  it('links to the legacy-issues report only when given the href', () => {
    const { rerender } = render(<ReportsScreen {...base} />);
    expect(screen.queryByText(/Legacy store issues/)).toBeNull();
    rerender(<ReportsScreen {...base} legacyIssuesHref="/mis/reports/legacy-issues" />);
    expect(screen.getByText(/Legacy store issues/).getAttribute('href')).toBe('/mis/reports/legacy-issues');
  });
});
