/** R2-411..414: the four opt-in widget bodies show what the server sent and honest empty states. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WidgetBody, type DashboardData } from './widgets';

const data = (over: Partial<DashboardData>) => ({ series: [], wastageByPhase: [], orders: [], ...over }) as unknown as DashboardData;

describe('stock.lowAlerts', () => {
  it('shows the count and the lowest names', () => {
    const lowStock = { count: 7, top: [{ id: 'a', code: 'A', name: 'Kraft roll', unit: 'KG', balance: 2, reorderLevel: 10 }] };
    render(<WidgetBody widgetKey="stock.lowAlerts" data={data({ lowStock })} />);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Kraft roll')).toBeTruthy();
    expect(screen.getByText(/\+6/)).toBeTruthy();
  });
  it('empty state when nothing is low or nothing was sent', () => {
    render(<WidgetBody widgetKey="stock.lowAlerts" data={data({ lowStock: { count: 0, top: [] } })} />);
    expect(screen.getByText('Nothing is at or below its reorder level.')).toBeTruthy();
  });
});

describe('po.fulfilment', () => {
  it('shows pending and received', () => {
    const poFulfilment = { pending: 4, overdue: 0, receivedThisMonth: 9, grnsThisMonth: 11, monthLabel: 'November' };
    render(<WidgetBody widgetKey="po.fulfilment" data={data({ poFulfilment })} />);
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
  });
  it('empty state with no PO activity', () => {
    render(<WidgetBody widgetKey="po.fulfilment" data={data({ poFulfilment: null })} />);
    expect(screen.getByText('No purchase orders pending or received this month.')).toBeTruthy();
  });
});

describe('bom.pipeline', () => {
  it('shows the three counts', () => {
    render(<WidgetBody widgetKey="bom.pipeline" data={data({ bomPipeline: { noBom: 3, draft: 2, pendingApproval: 1 } })} />);
    expect(screen.getByText('No BOM')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Pending approval')).toBeTruthy();
  });
  it('empty state when every order is approved', () => {
    render(<WidgetBody widgetKey="bom.pipeline" data={data({ bomPipeline: { noBom: 0, draft: 0, pendingApproval: 0 } })} />);
    expect(screen.getByText('Every open order has an approved BOM.')).toBeTruthy();
  });
});

describe('wastage.scrapTrend', () => {
  it('shows the overall rate with the unit it is in, and says other units are not mixed in', () => {
    const scrapTrend = { unit: 'KG', bucket: 'day' as const, points: [{ label: '1 Nov', ratePct: 5, produced: 95, waste: 5 }], overallPct: 5, otherUnits: ['PIECE'] };
    render(<WidgetBody widgetKey="wastage.scrapTrend" data={data({ scrapTrend, rangeLabel: 'Nov 2026' })} />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText(/KG · Nov 2026/)).toBeTruthy();
    expect(screen.getByText('Other units are not mixed in.')).toBeTruthy();
  });
  it('empty state when no production in range', () => {
    const scrapTrend = { unit: null, bucket: 'day' as const, points: [{ label: '1 Nov', ratePct: null, produced: 0, waste: 0 }], overallPct: null, otherUnits: [] };
    render(<WidgetBody widgetKey="wastage.scrapTrend" data={data({ scrapTrend })} />);
    expect(screen.getByText('No production recorded in this range.')).toBeTruthy();
  });
});
