/** R2-277 reverse (Owner) · R2-278 quarantine card · R2-279 ceiling messaging. Render only; the server rules are tested in r3-stk-grn. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true), confirmDialog: null }) }));
const reverseGrnAction = vi.fn(async () => ({ ok: true, value: { status: 'REVERSED' } }));
vi.mock('@/app/(mis)/mis/grn/actions', () => ({
  addGrnItemAction: vi.fn(), confirmGrnAction: vi.fn(), discardGrnAction: vi.fn(), removeGrnItemAction: vi.fn(), updateGrnHeaderAction: vi.fn(), updateGrnItemAction: vi.fn(),
  reverseGrnAction: (...a: unknown[]) => reverseGrnAction(...(a as [])), returnQuarantineAction: vi.fn(async () => ({ ok: true })),
}));

const { GrnDetailScreen } = await import('./grn-detail-screen');

const grn = (status: string) => ({
  id: 'g1', grnNumber: 'GRN-1', status, notes: null, reverseReason: status === 'REVERSED' ? 'typed 100 for 10' : null,
  po: { id: 'p1', poNumber: 'PO-1', supplier: null, items: [] }, items: [],
});
const held = { id: 'q1', itemName: 'Kraft', unit: 'KG', quantity: 20, status: 'HELD', returnedAt: null, returnNote: null };

describe('GrnDetailScreen', () => {
  it('R2-277: the Owner sees Reverse GRN on a confirmed GRN and sends the reason; an Admin does not see it', () => {
    const { unmount } = render(<GrnDetailScreen grn={grn('CONFIRMED')} canWrite canReverse />);
    fireEvent.click(screen.getByRole('button', { name: 'Reverse GRN' }));
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'typed 100 for 10' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reverse GRN' }).at(-1)!);
    expect(reverseGrnAction).toHaveBeenCalledWith('g1', 'typed 100 for 10');
    unmount();
    render(<GrnDetailScreen grn={grn('CONFIRMED')} canWrite canOverride />);
    expect(screen.queryByRole('button', { name: 'Reverse GRN' })).toBeNull();
  });

  it('a reversed GRN shows its reason; the quarantine card lists held lots with Return to supplier for the Owner only', () => {
    const { unmount } = render(<GrnDetailScreen grn={grn('REVERSED')} canWrite={false} quarantine={[held]} canReverse />);
    expect(screen.getByText(/Reversed: typed 100 for 10/)).toBeTruthy();
    expect(screen.getByText(/Quarantine · damaged goods/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Return to supplier' })).toBeTruthy();
    unmount();
    render(<GrnDetailScreen grn={grn('CONFIRMED')} canWrite quarantine={[{ ...held, status: 'RETURNED', returnedAt: '2026-10-30T00:00:00Z', returnNote: 'with the driver' }]} />);
    expect(screen.getByText(/Returned to supplier/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Return to supplier' })).toBeNull();
  });
});
