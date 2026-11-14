import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IconAction } from './icon-action';

describe('IconAction', () => {
  it('is named and titled by its label, and 44px', () => {
    render(<IconAction label="View order" icon={<span>i</span>} onClick={() => {}} />);
    const b = screen.getByRole('button', { name: 'View order' });
    expect(b.getAttribute('title')).toBe('View order');
    expect(b.className).toContain('h-11');
    expect(b.className).toContain('w-11');
  });
  it('fires onClick and respects disabled', () => {
    const fn = vi.fn();
    const { rerender } = render(<IconAction label="Edit" icon={<span>i</span>} onClick={fn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(fn).toHaveBeenCalledTimes(1);
    rerender(<IconAction label="Edit" icon={<span>i</span>} onClick={fn} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('renders a link when href is given', () => {
    render(<IconAction label="Open" icon={<span>i</span>} href="/mis/orders/1" />);
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/mis/orders/1');
  });
});
