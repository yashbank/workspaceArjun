/** R2-124/138/140/141/142: BOM list tabs, KPI strip, order link, state-aware CTA. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BomListScreen } from './bom-list-screen';

const base = { orderStatus: 'CONFIRMED', customerName: 'Acme', stageCount: 0, materialCount: 0, estimatedCostLabel: null, deliveryDate: '2026-11-05' };
const rows = [
  { ...base, orderId: 'a', orderNumber: 'ORD-A', description: 'x'.repeat(200), bomStatus: 'NO_BOM' as const },
  { ...base, orderId: 'b', orderNumber: 'ORD-B', description: 'B', bomStatus: 'DRAFT' as const },
  { ...base, orderId: 'c', orderNumber: 'ORD-C', description: 'C', bomStatus: 'PENDING_APPROVAL' as const },
  { ...base, orderId: 'd', orderNumber: 'ORD-D', description: 'D', bomStatus: 'APPROVED' as const },
];
const counts = { ALL: 48, NO_BOM: 3, DRAFT: 8, PENDING_APPROVAL: 4, APPROVED: 33 };
const paging = { total: 48, page: 1, params: { q: 'ac', status: 'DRAFT' } };

describe('BomListScreen', () => {
  it('renders status tabs with counts that keep q and reset page', () => {
    render(<BomListScreen rows={rows} counts={counts} paging={paging} />);
    const tab = screen.getByRole('link', { name: /Pending Approval.*4/ });
    expect(tab.getAttribute('href')).toBe('/mis/bom?q=ac&status=PENDING_APPROVAL');
    expect(screen.getByRole('link', { name: /All.*48/ }).getAttribute('href')).toBe('/mis/bom?q=ac');
    expect(screen.getByRole('link', { name: /Draft.*8/ }).getAttribute('aria-current')).toBe('page');
  });
  it('shows the KPI strip', () => {
    render(<BomListScreen rows={rows} counts={counts} paging={paging} />);
    for (const l of ['Active orders', 'Missing BOMs', 'Drafts', 'Pending approval']) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
  });
  it('order number is a mono link; description truncated with title; due date shown', () => {
    render(<BomListScreen rows={rows} counts={counts} paging={paging} />);
    const link = screen.getAllByRole('link', { name: 'ORD-A' })[0]!;
    expect(link.className).toContain('font-mono');
    expect(link.getAttribute('href')).toBe('/mis/bom/a');
    expect(screen.getAllByTitle('x'.repeat(200)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026-11-05').length).toBeGreaterThan(0);
  });
  it('CTA follows BOM state', () => {
    render(<BomListScreen rows={rows} counts={counts} paging={paging} />);
    expect(screen.getAllByRole('link', { name: '+ Create BOM' })[0]!.getAttribute('href')).toBe('/mis/bom/a?view=edit');
    expect(screen.getAllByRole('link', { name: 'Continue Editing' })[0]!.getAttribute('href')).toBe('/mis/bom/b?view=edit');
    expect(screen.getAllByRole('link', { name: 'Review & Approve' })[0]!.getAttribute('href')).toBe('/mis/bom/c');
    expect(screen.getAllByRole('link', { name: 'View BOM' })[0]!.getAttribute('href')).toBe('/mis/bom/d');
  });
});
