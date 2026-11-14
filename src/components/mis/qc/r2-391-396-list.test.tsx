/** R2-391/392/393/394/396: QC list on DataTable + StatusBadge, IconAction, KPIs, status filter. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/(mis)/mis/qc/actions', () => ({ addQcCheckAction: vi.fn() }));

const { QcScreen } = await import('./qc-screen');
const o = (id: string, status: string) => ({ id, orderNumber: `ORD-${id}`, status, customer: { name: 'Acme' } });

describe('QcScreen list', () => {
  it('renders View Checks icon link, KPI cards, status filter', () => {
    render(<QcScreen orders={[o('1', 'CONFIRMED'), o('2', 'IN_PRODUCTION')]} canWrite={false} defectTypes={[]} />);
    expect(screen.getAllByRole('link', { name: 'View Checks →' })[0]!.getAttribute('href')).toBe('/mis/qc/1');
    expect(screen.getByRole('group', { name: 'Quality summary' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'CONFIRMED' } });
    expect(screen.queryAllByText('ORD-2').length).toBe(0);
    expect(screen.getAllByText('ORD-1').length).toBeGreaterThan(0);
  });
  it('empty state text kept', () => {
    render(<QcScreen orders={[]} canWrite={false} defectTypes={[]} />);
    expect(screen.getByText('No active orders for QC.')).toBeTruthy();
  });
});
