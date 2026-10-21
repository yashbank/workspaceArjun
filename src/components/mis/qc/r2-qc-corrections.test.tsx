/** R2-34 — QC check Delete (server-decided) with a reason; Edit sends the reason. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const editQcCheckAction = vi.fn(async () => ({ ok: true, value: undefined }));
const voidQcCheckAction = vi.fn(async () => ({ ok: false, detail: 'A QC inspector can change a check only on the day it was recorded.' }));
vi.mock('@/app/(mis)/mis/qc/actions', () => ({
  addQcCheckAction: vi.fn(), recordAqlSampleAction: vi.fn(), recordChecklistCheckAction: vi.fn(),
  editQcCheckAction: (...a: unknown[]) => (editQcCheckAction as (...x: unknown[]) => unknown)(...a),
}));
vi.mock('@/app/(mis)/mis/qc/correction-actions', () => ({ voidQcCheckAction: (...a: unknown[]) => (voidQcCheckAction as (...x: unknown[]) => unknown)(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { QcDetailScreen } = await import('./qc-detail-screen');

const check = (over: Record<string, unknown> = {}) => ({ id: 'c1', checkTime: '2026-10-19T04:30:00Z', result: 'PASS', parameterName: 'Shade', notes: 'n', ...over });
const props = (checks: ReturnType<typeof check>[]) => ({
  order: { id: 'o1', orderNumber: 'ORD-1', status: 'IN_PRODUCTION', customer: null },
  checks, summary: { total: 1, pass: 1, fail: 0, totalDefectQty: 0 }, canWrite: true, defectTypes: [],
});

describe('R2-34 QC corrections', () => {
  it('Delete appears only when the server says so; it needs a reason and shows a refusal inline', async () => {
    const { unmount } = render(<QcDetailScreen {...props([check({ editable: true })])} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    unmount();
    render(<QcDetailScreen {...props([check({ deletable: true })])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const go = screen.getByRole('button', { name: 'Delete check' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for deleting'), { target: { value: 'wrong order' } });
    fireEvent.click(go);
    await waitFor(() => expect(voidQcCheckAction).toHaveBeenCalledWith('c1', 'wrong order'));
    expect(await screen.findByText(/only on the day it was recorded/)).toBeTruthy();
  });

  it('Edit sends the reason', async () => {
    render(<QcDetailScreen {...props([check({ editable: true })])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'misread gauge' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).at(-1)!);
    await waitFor(() => expect(editQcCheckAction).toHaveBeenCalledWith('c1', expect.objectContaining({ reason: 'misread gauge' })));
  });
});
