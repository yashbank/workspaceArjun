import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';

import { SlideOver } from '@/components/mis/kit/slide-over';
import { Combobox } from './combobox';

afterEach(cleanup);
const options = [{ value: 'a', label: 'Heidelberg' }, { value: 'b', label: 'Polar Cutter' }, { value: 'c', label: 'Polar Press' }];
const field = (name: string) => screen.getByRole('combobox', { name }) as HTMLInputElement;
const open = (input: HTMLInputElement) => fireEvent.focus(input);
const search = (input: HTMLInputElement, text: string) => fireEvent.change(input, { target: { value: text } });
const press = (input: HTMLInputElement, key: string, init: object = {}) => {
  const e = createEvent.keyDown(input, { key, ...init });
  fireEvent(input, e);
  return e;
};
const highlighted = () => screen.getAllByRole('option').filter((o) => o.getAttribute('data-selected') === 'true').map((o) => o.textContent);

describe('Enter after a search', () => {
  it('a clearable field picks the first match, not the None row', () => {
    const onChange = vi.fn();
    render(<Combobox label="Order" value="a" clearable options={options} onChange={onChange} />);
    const input = field('Order');
    open(input);
    search(input, 'polar');
    press(input, 'Enter');
    expect(onChange.mock.calls).toEqual([['b']]);
  });

  it('a clearable field with zero matches changes nothing', () => {
    const onChange = vi.fn();
    render(<Combobox label="Order" value="a" clearable options={options} onChange={onChange} />);
    const input = field('Order');
    open(input);
    search(input, 'zzz');
    press(input, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a plain field with zero matches changes nothing', () => {
    const onChange = vi.fn();
    render(<Combobox label="Order" value="a" options={options} onChange={onChange} />);
    const input = field('Order');
    open(input);
    search(input, 'zzz');
    press(input, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('every keystroke puts the highlight back on the first match, however far the arrows went', () => {
    const onChange = vi.fn();
    render(<Combobox label="Order" value={null} options={options} onChange={onChange} />);
    const input = field('Order');
    open(input);
    press(input, 'ArrowDown');
    press(input, 'ArrowDown');
    expect(highlighted()).toEqual(['Polar Press']);
    search(input, 'polar');
    expect(highlighted()).toEqual(['Polar Cutter']);
    press(input, 'Enter');
    expect(onChange.mock.calls).toEqual([['b']]);
  });

  it('Enter with no search keeps a clearable field as it was', () => {
    const onChange = vi.fn();
    render(<Combobox label="Order" value="b" clearable options={options} onChange={onChange} />);
    const input = field('Order');
    open(input);
    press(input, 'Enter');
    expect(onChange).not.toHaveBeenCalledWith('');
  });

  it('with no search the arrows still reach None, and the None row can be picked', () => {
    const onChange = vi.fn();
    render(<Combobox label="Order" value="a" clearable options={options} onChange={onChange} />);
    const input = field('Order');
    open(input);
    press(input, 'ArrowUp');
    expect(highlighted()).toEqual(['None']);
    press(input, 'Enter');
    expect(onChange.mock.calls).toEqual([['']]);
  });
});

describe('the text field keeps its own keys', () => {
  it('Home and End move the caret, not the highlight', () => {
    render(<Combobox label="Order" value={null} options={options} onChange={vi.fn()} />);
    const input = field('Order');
    open(input);
    press(input, 'ArrowDown');
    expect(press(input, 'End').defaultPrevented).toBe(false);
    expect(press(input, 'Home').defaultPrevented).toBe(false);
    expect(highlighted()).toEqual(['Polar Cutter']);
  });

  it.each(['n', 'j', 'p', 'k'])('Ctrl+%s is left to the browser', (key) => {
    render(<Combobox label="Order" value={null} options={options} onChange={vi.fn()} />);
    const input = field('Order');
    open(input);
    expect(press(input, key, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(highlighted()).toEqual(['Heidelberg']);
  });
});

describe('what a screen reader is told', () => {
  it('the listbox carries the field label, and aria-controls points at it', () => {
    render(<Combobox label="Machine" value={null} options={options} onChange={vi.fn()} />);
    const input = field('Machine');
    open(input);
    const list = screen.getByRole('listbox', { name: 'Machine' });
    expect(input.getAttribute('aria-controls')).toBe(list.id);
  });

  it('aria-selected marks the chosen row, wherever the highlight goes; aria-activedescendant follows the highlight', () => {
    render(<Combobox label="Machine" value="b" clearable options={options} onChange={vi.fn()} />);
    const input = field('Machine');
    open(input);
    const chosen = () => screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent);
    expect(chosen()).toEqual(['Polar Cutter']);
    press(input, 'ArrowDown');
    expect(highlighted()).toEqual(['Polar Press']);
    expect(chosen()).toEqual(['Polar Cutter']);
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)?.textContent).toBe('Polar Press');
  });

  it('None is the chosen row of an empty clearable field', () => {
    render(<Combobox label="Machine" value={null} clearable options={options} onChange={vi.fn()} />);
    open(field('Machine'));
    expect(screen.getByRole('option', { name: 'None' }).getAttribute('aria-selected')).toBe('true');
  });

  it('inside an aria-modal panel the list stays in the dialog subtree', () => {
    render(<SlideOver open title="Panel" onClose={vi.fn()}><Combobox label="Machine" value={null} options={options} onChange={vi.fn()} /></SlideOver>);
    open(field('Machine'));
    expect(within(screen.getByRole('dialog')).getByRole('listbox')).toBeTruthy();
  });
});
