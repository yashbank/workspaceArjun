import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
const adjustInventoryAction = vi.fn();
vi.mock('@/app/(mis)/mis/inventory/actions', () => ({
  adjustInventoryAction: (...a: unknown[]) => adjustInventoryAction(...a),
  createItemAction: vi.fn(),
  getItemFormOptionsAction: vi.fn(),
}));

const { ItemOptionFields } = await import('./item-option-fields');
const { AdjustDialog } = await import('@/components/mis/inventory/adjust-dialog');

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const options = {
  gsm: [{ value: '80', label: '80 GSM' }, { value: '90', label: '90 GSM' }],
  size: [],
  unit: [{ value: 'KG', label: 'Kg' }],
  canManage: true,
};

describe('R3-MST B32 GSM / Size / Unit are dropdowns', () => {
  it('GSM lists the master labels plus a "(not in masters)" entry for a legacy value', () => {
    render(<ItemOptionFields options={options} gsm="75 GSM" size="" unit="KG" onGsm={vi.fn()} onSize={vi.fn()} onUnit={vi.fn()} />);
    const gsm = screen.getByLabelText('GSM') as HTMLSelectElement;
    const labels = Array.from(gsm.options).map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(['80 GSM', '90 GSM', '75 GSM (not in masters)']));
    expect(gsm.value).toBe('75 GSM');
    expect(gsm.tagName).toBe('SELECT');
  });

  it('no free-text input remains for GSM, Size or Unit', () => {
    render(<ItemOptionFields options={options} gsm="" size="" unit="" onGsm={vi.fn()} onSize={vi.fn()} onUnit={vi.fn()} />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('an empty Size group shows the hint and a Masters link for masters.write holders only', () => {
    const { rerender } = render(<ItemOptionFields options={options} gsm="" size="" unit="" onGsm={vi.fn()} onSize={vi.fn()} onUnit={vi.fn()} />);
    expect(screen.getByText('Add values in Masters → Size')).toBeTruthy();
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/mis/masters')).toBe(true);
    rerender(<ItemOptionFields options={{ ...options, canManage: false }} gsm="" size="" unit="" onGsm={vi.fn()} onSize={vi.fn()} onUnit={vi.fn()} />);
    expect(screen.getByText('Add values in Masters → Size')).toBeTruthy();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('with no master options the unit dropdown offers the 4 legacy units', () => {
    render(<ItemOptionFields options={{ gsm: [], size: [], unit: [], canManage: false }} gsm="" size="" unit="" onGsm={vi.fn()} onSize={vi.fn()} onUnit={vi.fn()} />);
    const unit = screen.getByLabelText('Unit') as HTMLSelectElement;
    expect(Array.from(unit.options).map((o) => o.value).filter(Boolean)).toEqual(['KG', 'LITRE', 'PIECE', 'REAM']);
  });
});

describe('R3-MST B25 adjust dialog', () => {
  const open = () => {
    render(<AdjustDialog itemId="i1" itemName="Kraft" currentBalance={10} unit="KG" />);
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Stock' }));
  };

  it('Save stays disabled until a reason of at least 3 characters is given', () => {
    open();
    fireEvent.change(screen.getByLabelText('Change Quantity'), { target: { value: '-50' } });
    const save = screen.getByRole('button', { name: 'Save Adjustment' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'ab' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'count' } });
    expect(save.disabled).toBe(false);
  });

  it('a refused result shows the server error inline and keeps the slide-over open', async () => {
    adjustInventoryAction.mockResolvedValue({ ok: false, detail: 'Adjustment would result in negative balance' });
    open();
    fireEvent.change(screen.getByLabelText('Change Quantity'), { target: { value: '-50' } });
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'write-off' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Adjustment' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Adjustment would result in negative balance'));
    expect(adjustInventoryAction).toHaveBeenCalledWith('i1', -50, 'write-off');
    expect(screen.getByLabelText('Change Quantity')).toBeTruthy();
  });
});
