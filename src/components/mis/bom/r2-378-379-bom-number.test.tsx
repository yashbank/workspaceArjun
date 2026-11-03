/** R2-378/379: BOM # column renders bomNumber; legacy null shows an em dash. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BomListScreen } from './bom-list-screen';

const base = { orderStatus: 'CONFIRMED', customerName: 'Acme', stageCount: 0, materialCount: 0, estimatedCostLabel: null, deliveryDate: null, description: 'D', bomStatus: 'DRAFT' as const };

describe('R2-378/379 BOM # column', () => {
  it('shows the BOM number', () => {
    render(<BomListScreen rows={[{ ...base, orderId: 'a', orderNumber: 'ORD-A', bomNumber: 'BOM-202610-00042' }]} />);
    expect(screen.getAllByText('BOM #').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BOM-202610-00042').length).toBeGreaterThan(0);
  });
  it('legacy null / missing bomNumber renders an em dash without crashing', () => {
    render(<BomListScreen rows={[{ ...base, orderId: 'b', orderNumber: 'ORD-B', bomNumber: null }, { ...base, orderId: 'c', orderNumber: 'ORD-C' }]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
