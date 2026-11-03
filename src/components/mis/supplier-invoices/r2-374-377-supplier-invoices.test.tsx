/** R2-374..377: per-row isolated action state, compact table, KPI strip, CSV export + Print Voucher. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/(mis)/mis/supplier-invoices/actions', () => ({
  reconcileSupplierInvoiceAction: vi.fn(), signOffInvoiceVarianceAction: vi.fn(), approveInvoiceForPaymentAction: vi.fn(),
  markInvoicePaidAction: vi.fn(), rejectSupplierInvoiceAction: vi.fn(),
}));

const { SupplierInvoicesScreen } = await import('./supplier-invoices-screen');
const { buildInvoiceCsv } = await import('./invoice-export');

const row = (over: Record<string, unknown> = {}) => ({ id: 'inv1', invoiceNo: 'INV-1', invoiceDate: new Date('2026-10-01T00:00:00Z'), poNumber: 'PO-1', grnNumber: 'GRN-1', supplierName: 'Acme, Ltd', status: 'PENDING_REVIEW' as const, signedOff: null, ...over });
const two = [row(), row({ id: 'inv2', invoiceNo: 'INV-2' })];

describe('R2-374 per-row state', () => {
  it('typing a reject reason on row 1 leaves row 2 untouched', () => {
    render(<SupplierInvoicesScreen rows={two as never} canReconcile />);
    const boxes = screen.getAllByLabelText('Reject reason') as HTMLInputElement[];
    expect(boxes).toHaveLength(2); // the phone cards, one per invoice
    fireEvent.change(boxes[0], { target: { value: 'duplicate' } });
    expect(boxes[0].value).toBe('duplicate');
    expect(boxes[1].value).toBe('');
  });
});

describe('R2-375 compact table', () => {
  it('table cells hold no text inputs; Update status opens a dialog with the controls', () => {
    render(<SupplierInvoicesScreen rows={two as never} canReconcile />);
    const table = screen.getByRole('table', { hidden: true });
    expect(table.querySelectorAll('input')).toHaveLength(0);
    fireEvent.click(within(table).getAllByRole('button', { name: 'Update status', hidden: true })[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Reject reason')).toBeTruthy();
  });
});

describe('R2-376 KPI strip', () => {
  it('shows 4 cards from paging.counts', () => {
    const counts = { MATCHED: 3, DISCREPANCY_QTY: 1, DISCREPANCY_PRICE: 2, PENDING_REVIEW: 4, APPROVED_FOR_PAYMENT: 5, PAID: 0, REJECTED: 0 };
    render(<SupplierInvoicesScreen rows={two as never} canReconcile={false} paging={{ total: 15, page: 1, status: '', q: '', counts }} />);
    const cards = screen.getAllByTestId('invoice-kpi-card');
    expect(cards.map((c) => c.textContent)).toEqual(['Total Invoices15', 'Matched3', 'Discrepancies Requiring Action3', 'Approved for Payment5']);
  });
});

describe('R2-377 export + print', () => {
  it('CSV has header, escaped cells and no money columns without money', () => {
    const csv = buildInvoiceCsv(two as never);
    const [head, first] = csv.split('\r\n');
    expect(head).toBe('Invoice,PO,GRN,Supplier,Date,Status');
    expect(first).toBe('INV-1,PO-1,GRN-1,"Acme, Ltd",2026-10-01,PENDING_REVIEW');
    expect(buildInvoiceCsv([row({ money: { expected: '10', invoiced: '12', variance: '2' } })] as never)).toContain('Expected,Invoice amount,Difference');
  });
  it('Export CSV button and Print Voucher control render; print calls window.print', () => {
    vi.useFakeTimers();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<SupplierInvoicesScreen rows={two as never} canReconcile={false} />);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Print Voucher', hidden: true })[0]);
    vi.runAllTimers();
    expect(print).toHaveBeenCalled();
    expect(document.querySelector('[data-voucher]')?.textContent).toContain('INV-1');
    vi.useRealTimers();
  });
});
