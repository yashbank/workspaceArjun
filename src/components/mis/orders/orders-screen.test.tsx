/** R2-264 / R2-265: the order form takes a quantity + unit and an optional Customer PO #; the list shows both. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const saveOrderAction = vi.fn(async () => ({ ok: true, value: undefined }));
vi.mock('@/app/(mis)/mis/orders/actions', () => ({
  saveOrderAction: (...a: unknown[]) => saveOrderAction(...(a as [])), updateOrderStatusAction: vi.fn(),
}));
vi.mock('@/components/mis/orders/order-status-actions', () => ({ OrderStatusActions: () => null }));

const { OrdersScreen } = await import('./orders-screen');

const order = {
  id: 'o1', orderNumber: 'ORD-1', status: 'CONFIRMED', description: 'Cartons', deliveryDate: null, createdAt: new Date('2026-10-01T00:00:00Z'),
  customer: { id: 'c1', name: 'Acme' }, quantity: 10000, unit: 'PIECE', customerPoRef: 'PO-AMZ-2026-99',
};

describe('OrdersScreen', () => {
  it('lists the ordered quantity and the Customer PO #', () => {
    render(<OrdersScreen orders={[order]} customers={[{ id: 'c1', name: 'Acme' }]} canWrite />);
    // The screen renders a phone card list and a desktop table; both carry the figures.
    expect(screen.getAllByText('10,000 Pieces').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PO-AMZ-2026-99').length).toBeGreaterThan(0);
  });

  it('the New Order form asks for Quantity, Unit and Customer PO #, and sends them', () => {
    render(<OrdersScreen orders={[]} customers={[]} canWrite />);
    fireEvent.click(screen.getByRole('button', { name: /New Order/ }));
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'REAM' } });
    fireEvent.change(screen.getByLabelText('Customer PO # (optional)'), { target: { value: 'PO-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveOrderAction).toHaveBeenCalledWith(null, expect.objectContaining({ quantity: 250, unit: 'REAM', customerPoRef: 'PO-7' }));
  });
});
