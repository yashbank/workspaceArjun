import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/app/(mis)/mis/store/actions', () => ({ storeInAction: vi.fn(), storeOutAction: vi.fn() }));

const { StoreTransactionsScreen } = await import('./store-transactions-screen');

afterEach(() => { cleanup(); replace.mockClear(); });
const setup = (params: Record<string, string> = {}) => {
  render(<StoreTransactionsScreen txns={[]} items={[]} canWrite={false} paging={{ total: 0, page: 1, params }} />);
  return screen.getByLabelText('From date') as HTMLInputElement;
};

describe('the date filters commit once', () => {
  it('typing never navigates, and the typed value stays in the field', () => {
    const from = setup();
    fireEvent.change(from, { target: { value: '0002-03-01' } });
    fireEvent.change(from, { target: { value: '2026-03-01' } });
    expect(replace).not.toHaveBeenCalled();
    expect(from.value).toBe('2026-03-01');
  });

  it('blur commits the date to the URL', () => {
    const from = setup();
    fireEvent.change(from, { target: { value: '2026-03-01' } });
    fireEvent.blur(from);
    expect(replace).toHaveBeenCalledOnce();
    expect(replace.mock.calls[0][0]).toContain('from=2026-03-01');
  });

  it('Enter commits the date to the URL, and the blur after it does not commit again', () => {
    const to = (setup(), screen.getByLabelText('To date') as HTMLInputElement);
    fireEvent.change(to, { target: { value: '2026-03-31' } });
    fireEvent.keyDown(to, { key: 'Enter' });
    expect(replace).toHaveBeenCalledOnce();
    expect(replace.mock.calls[0][0]).toContain('to=2026-03-31');
  });

  it('leaving an unchanged field does nothing; emptying a set one clears it', () => {
    const from = setup({ from: '2026-03-01' });
    fireEvent.blur(from);
    expect(replace).not.toHaveBeenCalled();
    fireEvent.change(from, { target: { value: '' } });
    fireEvent.blur(from);
    expect(replace.mock.calls[0][0]).not.toContain('from=');
  });

  it('a date the browser calls incomplete is left alone', () => {
    const from = setup({ from: '2026-03-01' });
    Object.defineProperty(from, 'validity', { value: { badInput: true } });
    fireEvent.change(from, { target: { value: '' } });
    fireEvent.blur(from);
    expect(replace).not.toHaveBeenCalled();
  });
});
