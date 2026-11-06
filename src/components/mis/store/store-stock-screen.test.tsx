import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const { StoreStockScreen } = await import('./store-stock-screen');

afterEach(() => { cleanup(); replace.mockClear(); });
const row = { id: 'i1', code: 'C1', sku: null, name: 'Paper', category: 'CONSUMABLE', unit: 'KG', stockBalance: 0, reorderLevel: null, belowReorder: false, isDemo: false };
const setup = (params: Record<string, string | undefined> = {}) =>
  render(<StoreStockScreen rows={[row]} isOwner={false} paging={{ total: 1, page: 1, params }} />);

describe('store stock filters live in the URL', () => {
  it('category and status change the URL', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'RAW_MATERIAL' } });
    expect(replace.mock.calls[0][0]).toContain('category=RAW_MATERIAL');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'critical' } });
    expect(replace.mock.calls[1][0]).toContain('status=critical');
  });

  it('the fields read the URL, Clear filters shows for either alone and drops them', () => {
    setup({ category: 'CONSUMABLE' });
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('CONSUMABLE');
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).not.toContain('category');
    cleanup();
    setup({ status: 'ok' });
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('ok');
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).not.toContain('status');
  });

  it('shows the rows the server sent: filtering is the server\'s, so a page is never thinned', () => {
    setup({ category: 'RAW_MATERIAL' });
    expect(screen.getAllByText('Paper').length).toBeGreaterThan(0);
  });
});
