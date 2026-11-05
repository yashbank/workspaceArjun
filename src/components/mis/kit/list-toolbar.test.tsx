import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parseView } from '@/lib/mis/pagination';

import { ListToolbar } from './list-toolbar';

describe('ListToolbar', () => {
  it('toggle links keep filters, reset page, mark the active view', () => {
    render(<ListToolbar basePath="/mis/bom" params={{ q: 'ac', status: 'DRAFT', view: 'rows' }} searchLabel="Search" view="rows" />);
    expect(screen.getByLabelText('Cards view').getAttribute('href')).toBe('/mis/bom?q=ac&status=DRAFT&view=cards');
    expect(screen.getByLabelText('Rows view').getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('Clear filters').getAttribute('href')).toBe('/mis/bom?view=rows');
  });
  it('hides toggle and clear when asked / unfiltered', () => {
    render(<ListToolbar basePath="/mis/audit" params={{}} searchLabel="Search" showViewToggle={false} />);
    expect(screen.queryByLabelText('Cards view')).toBeNull();
    expect(screen.queryByText('Clear filters')).toBeNull();
  });
  it('parseView accepts only cards or rows', () => {
    expect(parseView('cards')).toBe('cards');
    expect(parseView('x')).toBeUndefined();
  });
});
