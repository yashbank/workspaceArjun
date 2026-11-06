import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const previewDeleteAction = vi.fn(async (_ids: string[]) => ({
  ok: true as const,
  groups: ['customers'],
  tree: [
    { name: 'mis_customers', rows: 3, depth: 0 },
    { name: 'mis_orders', rows: 7, depth: 1 },
  ],
}));
const createBackupAction = vi.fn(async (_ids: string[]) => ({
  ok: true as const,
  backup: { id: 'b1', name: 'bpp-backup-customers-x', createdAt: '2026-11-06T00:00:00Z', createdBy: 'o', totalRows: 10 },
}));
const deleteDataAction = vi.fn(async (_ids: string[], _id: string, _word: string) => ({ ok: true as const, rowsDeleted: 10, perTable: {} }));

vi.mock('@/app/(mis)/mis/settings/danger-zone/actions', () => ({
  previewDeleteAction: (ids: string[]) => previewDeleteAction(ids),
  createBackupAction: (ids: string[]) => createBackupAction(ids),
  deleteDataAction: (ids: string[], id: string, word: string) => deleteDataAction(ids, id, word),
  restoreBackupAction: vi.fn(),
}));

const { DangerZoneScreen } = await import('./danger-zone-screen');

const overview = {
  groups: [{ id: 'customers', label: 'Customers', description: 'd', requires: [], rows: 3 }],
  backups: [{ id: 'old', createdAt: '2026-01-01T00:00:00Z', totalRows: 1 }],
  storageOk: true,
};

describe('DangerZoneScreen', () => {
  it('walks gate, cascade tree, choice, backup and typed word before Delete unlocks', async () => {
    render(<DangerZoneScreen overview={overview} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByText('I understand, continue'));

    fireEvent.click(screen.getByRole('checkbox'));
    await screen.findByText(/orders: 7/);
    expect(screen.queryByText('Take backup now')).toBeNull();

    fireEvent.click(screen.getByText('Delete Customers + ALL related data'));
    expect(screen.queryByText('Delete now')).toBeNull(); // an old backup never unlocks it

    fireEvent.click(screen.getByText('Take backup now'));
    const del = (await screen.findByText('Delete now')) as HTMLButtonElement;
    expect(createBackupAction).toHaveBeenCalledWith(['customers']);
    expect(del.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: 'DELETE' } });
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    await waitFor(() => expect(deleteDataAction).toHaveBeenCalledWith(['customers'], 'b1', 'DELETE'));
  });

  it('says stock will read 0 when the tree holds the stock ledger, and only then', async () => {
    render(<DangerZoneScreen overview={overview} />);
    fireEvent.click(screen.getByText('I understand, continue'));
    fireEvent.click(screen.getByRole('checkbox'));
    await screen.findByText(/orders: 7/);
    expect(screen.queryByText(/Stock will read 0/)).toBeNull();
    fireEvent.click(screen.getByText('Cancel'));

    previewDeleteAction.mockResolvedValueOnce({ ok: true, groups: ['customers'], tree: [{ name: 'mis_inventory_ledger', rows: 4, depth: 0 }] });
    fireEvent.click(screen.getByRole('checkbox'));
    await screen.findByText(/inventory ledger: 4/);
    screen.getByText(/Stock will read 0/);
  });

  it('Cancel drops the selection', async () => {
    render(<DangerZoneScreen overview={overview} />);
    fireEvent.click(screen.getByText('I understand, continue'));
    fireEvent.click(screen.getByRole('checkbox'));
    await screen.findByText(/orders: 7/);
    fireEvent.click(screen.getByText('Cancel'));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText(/orders: 7/)).toBeNull();
  });
});
