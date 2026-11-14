/** R2-391..394: orders list uses IconAction row actions, a Status filter and KPI cards. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/(mis)/mis/orders/actions', () => ({ saveOrderAction: vi.fn(), updateOrderStatusAction: vi.fn() }));
vi.mock('@/components/mis/orders/order-status-actions', () => ({ OrderStatusActions: () => null }));

const { OrdersScreen } = await import('./orders-screen');
const mk = (id: string, status: string) => ({ id, orderNumber: `ORD-${id}`, status, description: null, deliveryDate: null, createdAt: new Date('2026-10-01T00:00:00Z'), customer: { id: 'c', name: 'Acme' }, quantity: 1, unit: 'PIECE', customerPoRef: null });

describe('OrdersScreen list polish', () => {
  it('row actions are icon buttons with the old names', () => {
    render(<OrdersScreen orders={[mk('1', 'DRAFT')]} customers={[]} canWrite />);
    expect(screen.getAllByRole('link', { name: 'View' })[0]!.getAttribute('href')).toBe('/mis/orders/1');
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Confirm' }).length).toBeGreaterThan(0);
  });
  it('shows 4 KPI cards and filters by status client-side', () => {
    render(<OrdersScreen orders={[mk('1', 'DRAFT'), mk('2', 'CONFIRMED')]} customers={[]} canWrite={false} />);
    expect(screen.getByRole('group', { name: 'Orders summary' })).toBeTruthy();
    for (const l of ['Orders on this page', 'Confirmed', 'In production', 'Completed']) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
    expect(screen.getAllByText('ORD-1').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'CONFIRMED' } });
    expect(screen.queryAllByText('ORD-1').length).toBe(0);
    expect(screen.getAllByText('ORD-2').length).toBeGreaterThan(0);
  });
});
