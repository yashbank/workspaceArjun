/** R2-404 — stock + transactions: 4 KPI cards from loaded rows, Ledger IconAction name kept, full width. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/app/(mis)/mis/store/actions', () => ({ storeInAction: vi.fn(), storeOutAction: vi.fn() }));

const { StoreStockScreen } = await import('./store-stock-screen');
const { StoreTransactionsScreen } = await import('./store-transactions-screen');
afterEach(cleanup);

describe('R2-404', () => {
  it('stock: 4 KPIs, Ledger link name kept', () => {
    const row = { id: 'i1', code: 'C1', sku: null, name: 'Paper', category: 'CONSUMABLE', unit: 'KG', stockBalance: 0, reorderLevel: null, belowReorder: false, isDemo: false };
    const { container } = render(<StoreStockScreen rows={[row]} isOwner={false} paging={{ total: 1, page: 1, params: {} }} />);
    expect(screen.getAllByTestId('stock-kpi-card')).toHaveLength(4);
    expect(screen.getAllByRole('link', { name: 'Ledger →' })[0].getAttribute('href')).toBe('/mis/store/ledger/i1');
    expect(container.innerHTML).not.toContain('max-w-5xl');
  });
  it('transactions: 4 KPIs, no max-w', () => {
    const { container } = render(<StoreTransactionsScreen txns={[]} items={[]} canWrite={false} paging={{ total: 0, page: 1, params: {} }} />);
    expect(screen.getAllByTestId('txn-kpi-card')).toHaveLength(4);
    expect(container.innerHTML).not.toContain('max-w-6xl');
  });
});
