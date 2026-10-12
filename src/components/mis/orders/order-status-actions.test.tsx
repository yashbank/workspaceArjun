import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(mis)/mis/orders/actions', () => ({ updateOrderStatusAction: vi.fn() }));

import { OrderStatusActions } from './order-status-actions';

const gates = [
  { key: 'PHASES_SIGNED_OFF' as const, label: 'Every phase signed off', passed: false, detail: '1 of 3 phases not signed off' },
  { key: 'QC_RESOLVED' as const, label: 'No unresolved QC failure', passed: true, detail: '' },
];
const base = { orderId: 'o1', orderNumber: 'ORD-1', gates: [], canOverride: true, override: null };

describe('OrderStatusActions', () => {
  it.each([
    ['DRAFT', ['Cancel order']],
    ['CONFIRMED', ['Start production', 'Cancel order']],
    ['IN_PRODUCTION', ['Mark complete', 'Cancel order']],
    ['COMPLETED', ['Mark delivered']],
    ['DELIVERED', []],
    ['CANCELLED', []],
  ])('%s offers exactly %j', (status, labels) => {
    render(<OrderStatusActions {...base} status={status} />);
    expect(screen.queryAllByRole('button').map((b) => b.textContent)).toEqual(labels);
  });

  it('lists each gate pass/fail and disables completing until an override reason is typed', () => {
    render(<OrderStatusActions {...base} status="IN_PRODUCTION" gates={gates} />);
    fireEvent.click(screen.getByText('Mark complete'));
    expect(screen.getByText('1 of 3 phases not signed off')).toBeTruthy();
    const go = screen.getByText('Complete anyway') as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Override reason/), { target: { value: 'collected early' } });
    expect(go.disabled).toBe(false);
  });

  it('a non-override role sees the gates but cannot complete past them', () => {
    render(<OrderStatusActions {...base} status="IN_PRODUCTION" gates={gates} canOverride={false} />);
    fireEvent.click(screen.getByText('Mark complete'));
    expect((screen.getByText('Complete anyway') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText(/Override reason/)).toBeNull();
  });
});
