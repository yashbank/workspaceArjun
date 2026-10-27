/** R2-146/147/152/153 — grouped results, shortcuts, empty/loading/recent states, keyboard navigation. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const searchMisAction = vi.fn();
vi.mock('@/app/(mis)/mis/search/actions', () => ({ searchMisAction: (q: string) => searchMisAction(q) }));

const { GlobalSearch } = await import('./global-search');

const RESULTS = [
  { type: 'machine', id: 'm1', title: 'Cutter', subtitle: 'M1', status: 'ACTIVE', href: '/mis/machine-board/m1' },
  { type: 'order', id: 'o1', title: 'ORD-1', subtitle: 'Acme', status: 'IN_PRODUCTION', href: '/mis/orders/o1' },
  { type: 'order', id: 'o2', title: 'ORD-2', subtitle: 'Beta', status: 'CONFIRMED', href: '/mis/orders/o2' },
];

async function type(q: string) {
  vi.useFakeTimers();
  render(<GlobalSearch shortcuts />);
  const box = screen.getByRole('combobox');
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: q } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  return box;
}

beforeEach(() => { push.mockReset(); searchMisAction.mockReset().mockResolvedValue({ ok: true, value: RESULTS }); localStorage.clear(); });
afterEach(() => vi.useRealTimers());

describe('GlobalSearch', () => {
  it('groups results by type with headers (orders before machines) and shows a status badge', async () => {
    await type('or');
    const headers = screen.getAllByRole('presentation').map((h) => h.textContent);
    expect(headers).toEqual(['Orders', 'Machines']);
    expect(screen.getByText('IN PRODUCTION')).toBeTruthy();
  });

  it('R2-153 arrow keys move, Enter navigates, Escape clears', async () => {
    const box = await type('or');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/mis/orders/o2');
    fireEvent.change(box, { target: { value: 'zz' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect((box as HTMLInputElement).value).toBe('');
  });

  it('shows the empty state with the query', async () => {
    searchMisAction.mockResolvedValue({ ok: true, value: [] });
    await type('ORD-999999-XYZ');
    expect(screen.getByText('No matches found for "ORD-999999-XYZ"')).toBeTruthy();
  });

  it('shows a spinner while the request is in flight', async () => {
    vi.useFakeTimers();
    searchMisAction.mockReturnValue(new Promise(() => {}));
    render(<GlobalSearch shortcuts />);
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'ab' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByRole('status').textContent).toContain('Searching');
  });

  it('Ctrl+K and / focus the search; / is ignored while typing in another field', () => {
    render(<><input aria-label="other" /><GlobalSearch shortcuts /></>);
    const box = screen.getByRole('combobox');
    expect(screen.getByText(/Ctrl K|⌘K/)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(box);
    (box as HTMLInputElement).blur();
    fireEvent.keyDown(document, { key: '/' });
    expect(document.activeElement).toBe(box);
    const other = screen.getByLabelText('other');
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(document.activeElement).toBe(other);
  });

  it('remembers a picked search and offers it when focused empty', async () => {
    const box = await type('or');
    fireEvent.keyDown(box, { key: 'Enter' });
    vi.useRealTimers();
    fireEvent.focus(box);
    expect(screen.getByText('or')).toBeTruthy();
  });
});
