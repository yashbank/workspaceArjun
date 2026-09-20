import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MasterTable, type MasterField, type MasterRow } from './master-table';
import type { Column } from '../kit/data-table';

type Dept = MasterRow & { name: string; nameHi: string | null };

const rows: Dept[] = [
  { id: '1', name: 'Cutting', nameHi: 'कटिंग', deletedAt: null },
  { id: '2', name: 'Printing', nameHi: null, deletedAt: null },
];

const columns: Column<Dept>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'nameHi', header: 'Name (Hindi)', render: (r) => r.nameHi ?? '—' },
];

const fields: MasterField[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'nameHi', label: 'Name (Hindi)', type: 'text' },
];

function renderTable(props: Partial<React.ComponentProps<typeof MasterTable<Dept>>> = {}) {
  return render(
    <MasterTable
      title="Departments"
      columns={columns}
      fields={fields}
      rows={rows}
      onSave={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />,
  );
}

afterEach(cleanup);

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

/**
 * The Department master from E2-02 is meant to be built by passing a column
 * config and nothing else, so these tests drive the component exactly the way a
 * master screen would.
 */
describe('MasterTable — happy path', () => {
  it('creates a row through the slide-over', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderTable({ onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lamination' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Lamination' });
    // Second argument null means "create", not "edit".
    expect(onSave.mock.calls[0][1]).toBeNull();
  });

  it('opens an existing row prefilled and reports it as the edit target', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderTable({ onSave });

    fireEvent.click(screen.getAllByText('Cutting')[0]);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Cutting');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cutting A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1]).toMatchObject({ id: '1' });
  });

  it('soft-deletes a live row', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderTable({ onDelete });

    fireEvent.click(screen.getAllByText('Cutting')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: '1' })));
  });

  it('offers restore — and never a second delete — for an already deleted row', () => {
    const deleted: Dept[] = [{ id: '3', name: 'Old Line', nameHi: null, deletedAt: new Date() }];
    renderTable({ rows: deleted, onDelete: vi.fn(), onRestore: vi.fn() });

    fireEvent.click(screen.getAllByText('Old Line')[0]);

    // Nothing in this component can remove a record permanently: a job card
    // printed last year must still resolve its values next year.
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

describe('MasterTable — denied', () => {
  it('renders read-only with no add or edit affordance when the user cannot write', () => {
    renderTable({ canWrite: false });

    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();

    // Rows are not clickable, so the edit slide-over cannot be reached at all.
    fireEvent.click(screen.getAllByText('Cutting')[0]);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

describe('MasterTable — edge', () => {
  it('searches on the server rather than filtering in the browser', async () => {
    const onSearch = vi.fn();
    renderTable({ onSearch });

    fireEvent.change(screen.getByLabelText('Departments: Search'), { target: { value: 'cut' } });

    // Debounced: one query goes out, not one per keystroke.
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('cut'), { timeout: 1500 });
    expect(onSearch).toHaveBeenCalledTimes(1);
    // The non-matching row is still on screen — filtering is the server's job.
    expect(screen.getAllByText('Printing').length).toBeGreaterThan(0);
  });

  it('distinguishes "no records yet" from "no matches"', () => {
    renderTable({ rows: [] });
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('+ Add option selects the new value without discarding the rest of the form', async () => {
    const onAddOption = vi.fn().mockResolvedValue('MATT');
    const onSave = vi.fn().mockResolvedValue(undefined);
    const withSelect: MasterField[] = [
      { key: 'name', label: 'Name', type: 'text', required: true },
      {
        key: 'coating',
        label: 'Coating',
        type: 'select',
        // Longer than eight, so the select renders its search box.
        options: Array.from({ length: 9 }, (_, i) => ({ value: `C${i}`, label: `Coating ${i}` })),
        onAddOption,
      },
    ];

    renderTable({ fields: withSelect, onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Box A' } });
    fireEvent.change(screen.getByLabelText('Coating: Search'), { target: { value: 'Matt' } });
    fireEvent.click(screen.getByRole('button', { name: /Add option/ }));

    await waitFor(() => expect(onAddOption).toHaveBeenCalledWith('Matt'));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    // The name typed before adding the option survived.
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Box A', coating: 'MATT' });
  });
});
