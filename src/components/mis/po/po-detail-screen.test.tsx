import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { notificationView, NOTIFICATION_TYPES } from '@/lib/mis/notification-copy';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/(mis)/mis/po/actions', () => ({
  addPoItemAction: vi.fn(), removePoItemAction: vi.fn(), submitPoAction: vi.fn(), approvePoAction: vi.fn(),
  cancelPoAction: vi.fn(), deletePoAction: vi.fn(), updatePoAction: vi.fn(),
}));

const { PoDetailScreen } = await import('./po-detail-screen');

afterEach(cleanup);

const po = { id: 'p1', poNumber: 'PO-1', status: 'DRAFT', bomRef: null, notes: null, supplier: null, grns: [] };
const line = { id: 'l1', description: 'Kraft', quantity: 5, receivedQuantity: 0, item: null };

describe('PO detail — draft actions (#6, #5, #4)', () => {
  it('Submit is disabled, with a tooltip, while the PO has no lines', () => {
    render(<PoDetailScreen po={po} formattedItems={[]} total={null} catalogItems={[]} canWrite canApprove />);
    const submit = screen.getByRole('button', { name: 'Submit for Approval' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(submit.parentElement?.getAttribute('title')).toBe('Add at least one line item');
  });

  it('Submit is enabled once a line with a quantity exists', () => {
    render(<PoDetailScreen po={po} formattedItems={[line]} total={null} catalogItems={[]} canWrite canApprove />);
    expect((screen.getByRole('button', { name: 'Submit for Approval' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a draft shows Edit details and Delete next to Cancel; a submitted PO shows neither', () => {
    const { rerender } = render(<PoDetailScreen po={po} formattedItems={[line]} total={null} catalogItems={[]} canWrite canApprove />);
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    rerender(<PoDetailScreen po={{ ...po, status: 'PENDING_APPROVAL' }} formattedItems={[line]} total={null} catalogItems={[]} canWrite canApprove />);
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('a read-only viewer gets no draft actions', () => {
    render(<PoDetailScreen po={po} formattedItems={[line]} total={null} catalogItems={[]} canWrite={false} canApprove={false} />);
    expect(screen.queryByRole('button', { name: 'Submit for Approval' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

describe('BOM rejected notification (#1)', () => {
  it('reads as a bell row linking back to the BOM', () => {
    expect(notificationView(NOTIFICATION_TYPES.bomRejected, { orderId: 'o1', orderNumber: 'ORD-1', reason: 'Add lamination' })).toMatchObject({
      title: 'BOM sent back · ORD-1', detail: 'Add lamination', href: '/mis/bom/o1',
    });
  });
});
