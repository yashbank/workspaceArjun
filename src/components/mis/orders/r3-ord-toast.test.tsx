import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const action = vi.fn();
vi.mock('@/app/(mis)/mis/orders/actions', () => ({ updateOrderStatusAction: (...a: unknown[]) => action(...a) }));
const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }));

import { OrderStatusActions } from './order-status-actions';

const base = { orderId: 'o1', orderNumber: 'ORD-1', gates: [], canOverride: true, override: null };

describe('R3 B112 / B104 — status actions', () => {
  it('Start production shows a refusal as a toast', async () => {
    action.mockResolvedValue({ ok: false, detail: 'ORD-1 was changed by someone else.' });
    render(<OrderStatusActions {...base} status="CONFIRMED" />);
    fireEvent.click(screen.getByText('Start production'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', 'ORD-1 was changed by someone else.'));
  });

  it('a thrown action does not escape; the person gets a toast', async () => {
    action.mockRejectedValue(new Error('network'));
    render(<OrderStatusActions {...base} status="COMPLETED" />);
    fireEvent.click(screen.getByText('Mark delivered'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', 'That did not save. Try again.'));
  });

  it('cancel lists the open items and offers "Cancel anyway", which confirms', async () => {
    action.mockResolvedValueOnce({ ok: false, detail: 'open items', openItems: ['BOM waiting for approval'] });
    action.mockResolvedValueOnce({ ok: true });
    render(<OrderStatusActions {...base} status="IN_PRODUCTION" />);
    fireEvent.click(screen.getByText('Cancel order'));
    fireEvent.change(screen.getByLabelText(/Why is this order being cancelled/), { target: { value: 'customer withdrew' } });
    fireEvent.click(screen.getAllByText('Cancel order').at(-1)!);
    await screen.findByText('BOM waiting for approval');
    fireEvent.click(screen.getByText('Cancel anyway'));
    await waitFor(() => expect(action).toHaveBeenLastCalledWith('o1', 'CANCELLED', 'customer withdrew', true));
  });
});
