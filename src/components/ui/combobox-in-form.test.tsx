import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';

import { SlideOver } from '@/components/mis/kit/slide-over';
import { Combobox } from './combobox';

afterEach(cleanup);
const options = [{ value: 'a', label: 'Heidelberg' }, { value: 'b', label: 'Polar Cutter' }];

describe('Combobox inside a panel and a form', () => {
  it('Escape closes the open list and leaves the panel; a second Escape closes the panel', () => {
    const onClose = vi.fn();
    render(<SlideOver open title="Request Leave" onClose={onClose}><Combobox label="Machine" value={null} options={options} onChange={vi.fn()} /></SlideOver>);
    const input = screen.getByRole('combobox', { name: 'Machine' });
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Enter on a closed list is left for the form; on an open list it picks and does not submit', () => {
    render(<form><Combobox label="Machine" value="a" options={options} onChange={vi.fn()} /></form>);
    const input = screen.getByRole('combobox', { name: 'Machine' });
    const closed = createEvent.keyDown(input, { key: 'Enter' });
    fireEvent(input, closed);
    expect(closed.defaultPrevented).toBe(false);

    fireEvent.focus(input);
    const open = createEvent.keyDown(input, { key: 'Enter' });
    fireEvent(input, open);
    expect(open.defaultPrevented).toBe(true);
  });
});
