import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageBack } from './page-back';

describe('PageBack', () => {
  it('renders a link to the parent with the label', () => {
    render(<PageBack href="/mis/store" label="Store" />);
    const a = screen.getByRole('link', { name: /Store/ });
    expect(a.getAttribute('href')).toBe('/mis/store');
    expect(a.textContent).toContain('←');
    expect(a.className).toContain('min-h-11');
    expect(a.className).toContain('text-slate-600');
  });
});
