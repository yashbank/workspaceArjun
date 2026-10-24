/** R2-10 — searchable catalog-item picker on BOM materials (add and edit). */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addMaterialAction = vi.fn();
const updateMaterialAction = vi.fn();
vi.mock('@/app/(mis)/mis/bom/actions', () => ({
  createBomAction: vi.fn(), addStageAction: vi.fn(), addMaterialAction: (...a: unknown[]) => addMaterialAction(...a), submitBomAction: vi.fn(), approveBomAction: vi.fn(),
  deleteStageAction: vi.fn(), deleteMaterialAction: vi.fn(), reorderStagesAction: vi.fn(), rejectBomAction: vi.fn(),
  deleteBomAction: vi.fn(), updateStageAction: vi.fn(), updateMaterialAction: (...a: unknown[]) => updateMaterialAction(...a),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => ({ confirm: vi.fn(), confirmDialog: null }) }));

import { BomScreen } from './bom-screen';

const ITEMS = [
  { id: 'i1', code: 'KR-120', name: 'Kraft Liner 120 GSM', unit: 'KG' },
  { id: 'i2', code: 'INK-R', name: 'Red ink', unit: 'LITRE' },
];
type Mat = { id: string; description: string; itemId?: string | null; quantity: number; unit: string; ratePerUnit: number | null; item: { name: string; unit: string } | null };
const bom = (materials: Mat[] = []) => ({
  id: 'b1', status: 'DRAFT', approvedAt: null,
  stages: [{ id: 's1', stageName: 'Printing', seq: 0, processId: null, process: null, materials }],
});

beforeEach(() => {
  addMaterialAction.mockReset().mockResolvedValue({ ok: true, value: undefined });
  updateMaterialAction.mockReset().mockResolvedValue({ ok: true, value: undefined });
});

describe('R2-10 BOM item picker', () => {
  it('search finds by name or code; picking fills description and unit and sends itemId', async () => {
    render(<BomScreen bom={bom()} orderId="o1" canWrite isOwner={false} items={ITEMS} />);
    fireEvent.click(screen.getByText('+ Material'));
    fireEvent.change(screen.getByPlaceholderText('Search by code or name'), { target: { value: 'red' } });
    expect(screen.queryByText(/Kraft Liner/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'INK-R · Red ink (LITRE)' }));
    expect(screen.getByTestId('picked-item').textContent).toBe('INK-R · Red ink (LITRE)');
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Red ink');
    // R2-154: Unit is now a Combobox (Master Units, falling back to the legacy 4 when the
    // catalog has none) — it displays the option's label, "Litre", not the raw stored value.
    expect((screen.getByLabelText('Unit') as HTMLInputElement).value).toBe('Litre');
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addMaterialAction).toHaveBeenCalledWith('s1', expect.objectContaining({ itemId: 'i2', description: 'Red ink', unit: 'LITRE', quantity: 2 })));
  });

  it('edit shows the current link; Unlink sends itemId null', async () => {
    const m = { id: 'm1', description: 'Board', itemId: 'i1', quantity: 5, unit: 'KG', ratePerUnit: null, item: { name: 'Kraft Liner 120 GSM', unit: 'KG' } };
    render(<BomScreen bom={bom([m])} orderId="o1" canWrite isOwner={false} items={ITEMS} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' }).at(-1)!);
    expect(screen.getByTestId('picked-item').textContent).toBe('KR-120 · Kraft Liner 120 GSM (KG)');
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateMaterialAction).toHaveBeenCalledWith('m1', expect.objectContaining({ itemId: null })));
  });

  it('no catalog (no masters.read) means no picker, free text as before', () => {
    render(<BomScreen bom={bom()} orderId="o1" canWrite isOwner={false} />);
    fireEvent.click(screen.getByText('+ Material'));
    expect(screen.queryByPlaceholderText('Search by code or name')).toBeNull();
  });
});
