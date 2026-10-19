/** R2-17 Edit/Delete per row (server-decided) with a reason; R2-48 makeready on the log and edit forms. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editProductionLogAction = vi.fn();
const voidProductionLogAction = vi.fn();
const submitProduction = vi.fn();
vi.mock('@/app/(mis)/mis/production/actions', () => ({
  clearLineAction: vi.fn(), editProductionLogAction: (...a: unknown[]) => editProductionLogAction(...a),
}));
vi.mock('@/app/(mis)/mis/production/correction-actions', () => ({ voidProductionLogAction: (...a: unknown[]) => voidProductionLogAction(...a) }));
vi.mock('./submit-production', () => ({ submitProduction: (...a: unknown[]) => submitProduction(...a), isClearanceBlock: () => false }));
vi.mock('@/components/mis/shell/pending-sync-note', () => ({ PendingSyncNote: () => null }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const { ProductionDetailScreen } = await import('./production-detail-screen');

const log = (over: Record<string, unknown> = {}) => ({
  id: 'l1', loggedAt: '2026-10-19T04:30:00Z', qtyProduced: 100, qtyWaste: 2, unit: 'KG', notes: null,
  machine: { name: 'Bobst' }, employee: null, shift: null, makereadyMinutes: 15, ...over,
});
const props = (logs: ReturnType<typeof log>[]) => ({
  order: { id: 'o1', orderNumber: 'ORD-1', status: 'IN_PRODUCTION', customer: null },
  logs, summary: { totalProduced: 100, totalWaste: 2, entries: 1 }, operators: [], machines: [{ id: 'm1', name: 'Bobst' }],
  units: [{ value: 'KG', label: 'KG' }], stages: [], allocatedMachines: [{ id: 'm1', name: 'Bobst' }], canWrite: true, userId: 'u1',
  factoryToday: '2026-10-19', nowIso: '2026-10-19T05:00:00Z',
});

beforeEach(() => {
  editProductionLogAction.mockReset().mockResolvedValue({ ok: true, value: { id: 'l1', orderId: 'o1' } });
  voidProductionLogAction.mockReset().mockResolvedValue({ ok: true, value: { id: 'l1', orderId: 'o1' } });
  submitProduction.mockReset().mockResolvedValue({ kind: 'APPLIED' });
});

describe('R2-17 Edit / Delete', () => {
  it('shows exactly what the server allowed', () => {
    const { unmount } = render(<ProductionDetailScreen {...props([log({ canEdit: false, canDelete: false })])} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    unmount();
    render(<ProductionDetailScreen {...props([log({ canEdit: true, canDelete: true })])} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByText('15 min')).toBeTruthy();
  });

  it('Edit needs a reason and sends it with the makeready minutes', async () => {
    render(<ProductionDetailScreen {...props([log({ canEdit: true })])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Makeready (minutes)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'scale was off' } });
    fireEvent.click(save);
    await waitFor(() => expect(editProductionLogAction).toHaveBeenCalledWith('l1', expect.objectContaining({ makereadyMinutes: 30, reason: 'scale was off' })));
  });

  it('Delete asks for a reason and calls voidProductionLogAction; a refusal shows inline', async () => {
    voidProductionLogAction.mockResolvedValue({ ok: false, detail: 'Entries older than 7 days cannot be changed.' });
    render(<ProductionDetailScreen {...props([log({ canDelete: true })])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.change(screen.getByLabelText('Reason for deleting'), { target: { value: 'entered twice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => expect(voidProductionLogAction).toHaveBeenCalledWith('l1', 'entered twice'));
    expect(await screen.findByText('Entries older than 7 days cannot be changed.')).toBeTruthy();
  });
});

describe('R2-48 makeready on the log form', () => {
  it('sends whole minutes; a bad value stops the submit', async () => {
    render(<ProductionDetailScreen {...props([])} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Log Production' }));
    fireEvent.change(screen.getByLabelText('Qty Produced'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Makeready (minutes, optional)'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(await screen.findByText('Makeready must be whole minutes between 0 and 1440.')).toBeTruthy();
    expect(submitProduction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Makeready (minutes, optional)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));
    await waitFor(() => expect(submitProduction.mock.calls[0][0].payload).toMatchObject({ makereadyMinutes: 20, qtyProduced: 50 }));
  });
});
