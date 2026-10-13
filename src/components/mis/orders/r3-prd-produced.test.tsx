import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(mis)/mis/orders/actions', () => ({ addOrderDocumentAction: vi.fn(), reopenOrderAction: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { OrderDetailScreen } from './order-detail-screen';

const order = { id: 'o1', orderNumber: 'ORD-1', status: 'IN_PRODUCTION', description: null, deliveryDate: null, notes: null, createdAt: new Date(), customer: { name: 'Acme' } };

function renderWith(byUnit: { unit: string; produced: number }[]) {
  return render(
    <OrderDetailScreen
      order={order} phases={[]} bom={null} productionLogs={[]}
      productionSummary={{ totalProduced: 500, totalWaste: 0, entries: 2, byUnit }}
      qcLogs={[]} qcSummary={{ total: 0, pass: 0, fail: 0 }} documents={[]}
      statusActions={null} canWrite={false} canSeeWages={false} canProduction canQc={false}
    />,
  );
}

describe('R3 B124 order detail Produced tile', () => {
  it('a mixed-unit order shows two totals, never a sum or a hard-coded kg', () => {
    renderWith([{ unit: 'KG', produced: 200 }, { unit: 'PIECE', produced: 500 }]);
    expect(screen.getByText('200 KG · 500 PIECE')).toBeTruthy();
    expect(screen.queryByText(/700/)).toBeNull();
  });
});
