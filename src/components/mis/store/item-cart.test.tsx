/** R2-349/356/360/362/366/368 — the issue cart: Enter adds the exact match, quantities stay decimal, clear / sort / focus. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => ({ confirm: async () => true, confirmDialog: null }) }));
vi.mock('./scan-button', () => ({ ScanButton: () => null }));

const { ItemCart } = await import('./item-cart');

const items = [
  { id: 'i1', code: 'KRAFT-1', sku: null, name: 'Kraft 120', unit: 'KG', balance: 50 },
  { id: 'i2', code: 'INK-9', sku: 'BAR-0009', name: 'Black ink', unit: 'KG', balance: 10 },
];
const onCommit = vi.fn(async () => undefined);
const cart = (extra: Record<string, unknown> = {}) => render(<ItemCart items={items} mode="ISSUE" onCommit={onCommit} {...extra} />);
const search = () => screen.getByLabelText('Scan or search an item') as HTMLInputElement;
const qtyOf = (name: string) => screen.getByLabelText(new RegExp(`Quantity of ${name}`)) as HTMLInputElement;

beforeEach(() => vi.clearAllMocks());

describe('R2-356 Enter in the search box', () => {
  it('an exact code adds the item with qty 1 and empties the box for the next scan', () => {
    cart();
    fireEvent.change(search(), { target: { value: 'kraft-1' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(qtyOf('Kraft 120').value).toBe('1');
    expect(search().value).toBe('');
  });
  it('an exact SKU adds too; an ambiguous text adds nothing', () => {
    cart();
    fireEvent.change(search(), { target: { value: 'BAR-0009' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(qtyOf('Black ink').value).toBe('1');
    fireEvent.change(search(), { target: { value: 'k' } }); // Kraft and Black ink both match "k"
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(screen.queryByLabelText(/Quantity of Kraft/)).toBeNull();
  });
});

describe('R2-360 the quantity field', () => {
  it('ignores "1e5", "+", "-" and letters; accepts "12.5"; never shows NaN in the total', () => {
    cart();
    fireEvent.change(search(), { target: { value: 'KRAFT-1' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    const qty = qtyOf('Kraft 120');
    for (const bad of ['1e5', '+3', '-2', 'abc', '1.234']) {
      fireEvent.change(qty, { target: { value: bad } });
      expect(qty.value).toBe('1');
    }
    fireEvent.change(qty, { target: { value: '12.5' } });
    expect(qty.value).toBe('12.5');
    expect(screen.getByText(/12\.5 total qty/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('NaN');
  });
});

describe('R2-362 / R2-366 / R2-349 the cart table', () => {
  const addBoth = () => {
    fireEvent.change(search(), { target: { value: 'KRAFT-1' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    fireEvent.change(search(), { target: { value: 'INK-9' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
  };
  it('shows the column headers (Code, Item, Available, Left on order, Issue qty, UOM) and the left-on-order figure', () => {
    cart({ leftOnOrder: { i1: 30 } });
    addBoth();
    for (const h of ['Code', 'Item', 'Available', 'Left on order', 'Issue qty', 'UOM']) expect(screen.getAllByText(h).length).toBeGreaterThan(0);
    expect(screen.getAllByText('30').length).toBeGreaterThan(0);
  });
  it('"Clear cart" empties every line after confirmation', async () => {
    cart();
    addBoth();
    fireEvent.click(screen.getByRole('button', { name: 'Clear cart' }));
    await waitFor(() => expect(screen.queryByLabelText(/Quantity of/)).toBeNull());
    expect(screen.getByText('Scan or search an item to start')).toBeTruthy();
  });
  it('sorting by name / balance reorders the rows without changing the lines', () => {
    cart();
    addBoth(); // added: Kraft (50), Black ink (10)
    const names = () => screen.getAllByLabelText(/Quantity of/).map((el) => el.getAttribute('aria-label'));
    expect(names()).toEqual(['Quantity of Kraft 120 in KG', 'Quantity of Black ink in KG']);
    fireEvent.change(screen.getByLabelText('Sort cart rows'), { target: { value: 'name' } });
    expect(names()).toEqual(['Quantity of Black ink in KG', 'Quantity of Kraft 120 in KG']);
    fireEvent.change(screen.getByLabelText('Sort cart rows'), { target: { value: 'balance' } });
    expect(names()).toEqual(['Quantity of Kraft 120 in KG', 'Quantity of Black ink in KG']);
    expect(screen.getByText(/2 items/)).toBeTruthy();
  });
});

describe('R2-368 the + / − buttons keep the quantity field focused', () => {
  it('after "One more" the quantity input is the active element and the value stepped', async () => {
    cart();
    fireEvent.change(search(), { target: { value: 'KRAFT-1' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    const qty = qtyOf('Kraft 120');
    qty.focus();
    fireEvent.click(screen.getByRole('button', { name: 'One more Kraft 120' }));
    expect(qty.value).toBe('2');
    await waitFor(() => expect(document.activeElement).toBe(qty));
  });
});
