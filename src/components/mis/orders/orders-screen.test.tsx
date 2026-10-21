import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(mis)/mis/orders/actions', () => ({ saveOrderAction: vi.fn(), updateOrderStatusAction: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { OrdersScreen } from './orders-screen';

const row = (id: string, status: string) => ({ id, orderNumber: `ORD-${id}`, status, description: null, deliveryDate: null, createdAt: new Date(), customer: null });

describe('R2-31/R2-32 orders list status controls', () => {
  it('offers Start production, Mark complete and Mark delivered from the list', () => {
    render(<OrdersScreen orders={[row('1', 'CONFIRMED'), row('2', 'IN_PRODUCTION'), row('3', 'COMPLETED')]} customers={[]} canWrite />);
    expect(screen.getAllByText('Start production').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mark complete').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mark delivered').length).toBeGreaterThan(0);
  });
  it('hides the controls without orders.write', () => {
    render(<OrdersScreen orders={[row('2', 'IN_PRODUCTION')]} customers={[]} canWrite={false} />);
    expect(screen.queryByText('Mark complete')).toBeNull();
  });
});
