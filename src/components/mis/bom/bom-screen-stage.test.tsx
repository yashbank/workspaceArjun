import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(mis)/mis/bom/actions', () => ({
  createBomAction: vi.fn(), addStageAction: vi.fn(), addMaterialAction: vi.fn(), submitBomAction: vi.fn(), approveBomAction: vi.fn(),
  deleteStageAction: vi.fn(), deleteMaterialAction: vi.fn(), reorderStagesAction: vi.fn(), rejectBomAction: vi.fn(),
  deleteBomAction: vi.fn(), updateStageAction: vi.fn(), updateMaterialAction: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => ({ confirm: vi.fn(), confirmDialog: null }) }));

import { BomScreen } from './bom-screen';

const bom = { id: 'b1', status: 'DRAFT', approvedAt: null, stages: [{ id: 's1', stageName: 'Printing', seq: 0, processId: 'p1', process: { name: 'Printing' }, materials: [] }] };

describe('R2-70 BOM stage picker', () => {
  it('uses a process dropdown instead of free text when master processes exist', () => {
    render(<BomScreen bom={bom} orderId="o1" canWrite isOwner={false} processes={[{ id: 'p1', name: 'Printing' }, { id: 'p2', name: 'Die cutting' }]} />);
    fireEvent.click(screen.getByText('+ Stage'));
    expect(screen.queryByLabelText('Stage Name')).toBeNull();
    expect(screen.getByText('Stage (process)')).toBeTruthy();
  });
  it('falls back to free text when there are no master processes', () => {
    render(<BomScreen bom={bom} orderId="o1" canWrite isOwner={false} />);
    fireEvent.click(screen.getByText('+ Stage'));
    expect(screen.getByLabelText('Stage Name')).toBeTruthy();
  });
  it('R2-126: stage process is a searchable combobox, picking sets the stage name', () => {
    render(<BomScreen bom={bom} orderId="o1" canWrite isOwner={false} processes={[{ id: 'p1', name: 'Printing' }, { id: 'p2', name: 'Die cutting' }]} />);
    fireEvent.click(screen.getByText('+ Stage'));
    const box = screen.getByRole('combobox', { name: 'Stage (process)' });
    fireEvent.change(box, { target: { value: 'die' } });
    expect(screen.queryByRole('option', { name: /Printing/ })).toBeNull();
    fireEvent.mouseDown(screen.getByRole('option', { name: /Die cutting/ }));
    expect((screen.getByRole('combobox', { name: 'Stage (process)' }) as HTMLInputElement).value).toBe('Die cutting');
  });
});
