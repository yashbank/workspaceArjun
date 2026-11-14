/** R2-391/392/393/394/395: production list on DataTable + StatusBadge, IconAction, KPIs, status filter. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/(mis)/mis/production/actions', () => ({ clearLineAction: vi.fn(), getClearanceHistoryAction: vi.fn(), getProductionFormContextAction: vi.fn() }));
vi.mock('./submit-production', () => ({ submitProduction: vi.fn(), isClearanceBlock: () => false }));
vi.mock('@/components/mis/shell/pending-sync-note', () => ({ PendingSyncNote: () => null }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { ProductionScreen } = await import('./production-screen');
const o = (id: string, status: string, n: number) => ({ id, orderNumber: `ORD-${id}`, status, customer: { name: 'Acme' }, _count: { productionLogs: n } });
const props = { machines: [], units: [], canWrite: false, userId: 'u', loadedAt: new Date().toISOString() };

describe('ProductionScreen list', () => {
  it('renders rows, View Logs icon link, KPI cards and filters', () => {
    render(<ProductionScreen {...props} orders={[o('1', 'CONFIRMED', 2), o('2', 'IN_PRODUCTION', 3)]} />);
    expect(screen.getAllByRole('link', { name: 'View Logs →' })[0]!.getAttribute('href')).toBe('/mis/production/1');
    expect(screen.getByRole('group', { name: 'Production summary' })).toBeTruthy();
    expect(screen.getAllByText('Production entries').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'IN_PRODUCTION' } });
    expect(screen.queryAllByText('ORD-1').length).toBe(0);
    expect(screen.getAllByText('ORD-2').length).toBeGreaterThan(0);
  });
  it('empty state text kept', () => {
    render(<ProductionScreen {...props} orders={[]} />);
    expect(screen.getByText('No active orders.')).toBeTruthy();
  });
});
