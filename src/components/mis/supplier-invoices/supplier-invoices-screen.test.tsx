/** R2-280: a discrepancy invoice carries the Owner's sign-off control, a note for everyone else, and the sign-off once given. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
const signOff = vi.fn(async () => ({ ok: true, value: { id: 'inv1' } }));
vi.mock('@/app/(mis)/mis/supplier-invoices/actions', () => ({
  reconcileSupplierInvoiceAction: vi.fn(), signOffInvoiceVarianceAction: (...a: unknown[]) => signOff(...(a as [])),
}));

const { SupplierInvoicesScreen } = await import('./supplier-invoices-screen');

const row = (over: Record<string, unknown> = {}) => ({ id: 'inv1', invoiceNo: 'INV-1', invoiceDate: null, poNumber: 'PO-1', grnNumber: 'GRN-1', supplierName: 'Acme', status: 'DISCREPANCY_PRICE' as const, signedOff: null, ...over });

describe('SupplierInvoicesScreen', () => {
  it('the Owner gets Sign off variance on a discrepancy row and the action receives the note', () => {
    render(<SupplierInvoicesScreen rows={[row()]} canReconcile canSignOff />);
    fireEvent.change(screen.getAllByLabelText('Sign-off note')[0], { target: { value: 'freight agreed' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign off variance' })[0]);
    expect(signOff).toHaveBeenCalledWith('inv1', 'freight agreed');
  });

  it('everyone else reads "not to be paid"; a signed-off row says who and when; a matched row has neither', () => {
    const { unmount } = render(<SupplierInvoicesScreen rows={[row()]} canReconcile={false} />);
    expect(screen.getAllByText(/Not to be paid until the Owner signs off/).length).toBeGreaterThan(0);
    unmount();
    render(<SupplierInvoicesScreen rows={[row({ signedOff: { at: new Date('2026-10-30T00:00:00Z'), note: 'ok' } }), row({ id: 'inv2', status: 'MATCHED' })]} canReconcile={false} />);
    expect(screen.getAllByText(/Variance signed off by the Owner · 2026-10-30 · ok/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Not to be paid/)).toBeNull();
  });
});
