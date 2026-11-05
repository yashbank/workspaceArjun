import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchInput } from './search-input';

afterEach(() => vi.useRealTimers());

describe('SearchInput', () => {
  it('debounces onSearch and clears immediately', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<SearchInput label="Search items" value="" onSearch={onSearch} delay={300} />);
    const box = screen.getByLabelText('Search items');
    fireEvent.change(box, { target: { value: 'a' } });
    fireEvent.change(box, { target: { value: 'ab' } });
    act(() => void vi.advanceTimersByTime(299));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('ab');
    fireEvent.click(screen.getByLabelText('Clear Search items'));
    expect(onSearch).toHaveBeenLastCalledWith('');
  });
});
