import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Combobox } from './combobox';

afterEach(cleanup);
const options = [{ value: 'a', label: 'Heidelberg' }, { value: 'b', label: 'Polar Cutter' }, { value: 'c', label: 'Corrugation Line' }];

describe('R2-82 Combobox', () => {
  it('typing filters the list and clicking an option selects it', () => {
    const onChange = vi.fn();
    render(<Combobox label="Machine" value={null} options={options} onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Machine' });
    fireEvent.focus(input);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.change(input, { target: { value: 'polar' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Polar Cutter']);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Polar Cutter' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
  it('arrow keys + Enter pick, Escape closes, no match shows a message', () => {
    const onChange = vi.fn();
    render(<Combobox label="Machine" value="a" options={options} onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Machine' }) as HTMLInputElement;
    expect(input.value).toBe('Heidelberg');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('R2-354 keyboard: Tab (blur) and Escape both close the list', () => {
  it('blur closes the list and drops the half-typed query', () => {
    render(<Combobox label="Department" value={null} options={options} onChange={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Department' }) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'pol' } });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('');
  });
  it('the clearable "None" row calls onChange("") and closes (R2-353)', () => {
    const onChange = vi.fn();
    render(<Combobox label="Order" value="a" clearable options={options} onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Order' });
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'None' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
