/** R2-346/347/353 — order and department pickers are searchable comboboxes; "None" means General / factory use and closes the list. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(mis)/mis/store/actions', () => ({ commitIssueAction: vi.fn(), getItemBalancesAction: vi.fn() }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => ({ confirm: async () => true, confirmDialog: null }) }));
vi.mock('./scan-button', () => ({ ScanButton: () => null }));

const { IssueScreen } = await import('./issue-screen');

const props = {
  header: { title: 'Issue', meta: 'today' },
  items: [{ id: 'i1', code: 'K1', sku: null, name: 'Kraft', unit: 'KG', balance: 5 }],
  orders: Array.from({ length: 30 }, (_, i) => ({ id: `o${i}`, orderNumber: `ORD-${100 + i}`, customerName: i === 3 ? 'Acme Boxes' : 'Other' })),
  departments: [{ id: 'd1', name: 'Press' }, { id: 'd2', name: 'Die cutting' }],
  costCenters: [{ value: 'PRESS', label: 'Press room' }],
};

describe('R2-346 / R2-347 searchable pickers', () => {
  it('orders are a combobox, searchable by order number or customer, not thirty chips', () => {
    render(<IssueScreen {...props} />);
    expect(screen.queryAllByRole('button', { name: /^ORD-/ })).toHaveLength(0);
    const order = screen.getByRole('combobox', { name: 'Order' });
    fireEvent.focus(order);
    fireEvent.change(order, { target: { value: 'acme' } });
    expect(screen.getAllByRole('option').filter((o) => o.textContent?.includes('ORD-')).map((o) => o.textContent)).toEqual(['ORD-103Acme Boxes']);
    fireEvent.change(order, { target: { value: 'ORD-12' } });
    expect(screen.getAllByRole('option').filter((o) => o.textContent?.includes('ORD-')).length).toBeGreaterThan(1);
  });
  it('departments are a combobox with a "None" row (clear)', () => {
    render(<IssueScreen {...props} />);
    const dept = screen.getByRole('combobox', { name: 'Department' }) as HTMLInputElement;
    fireEvent.focus(dept);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Die cutting' }));
    expect(dept.value).toBe('Die cutting');
    fireEvent.focus(dept);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'None' }));
    expect(dept.value).toBe('');
  });
});

describe('R2-353 picking "None" on the order list closes it and shows General / factory use', () => {
  it('the list closes and the General-use block appears', () => {
    render(<IssueScreen {...props} />);
    const order = screen.getByRole('combobox', { name: 'Order' });
    fireEvent.focus(order);
    fireEvent.mouseDown(screen.getByRole('option', { name: /^ORD-100/ }));
    expect(screen.queryByText(/General \/ factory use \(/)).toBeNull();
    fireEvent.focus(order);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'None' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText(/General \/ factory use \(/)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Cost centre (required)' })).toBeTruthy(); // R2-348
  });
});
