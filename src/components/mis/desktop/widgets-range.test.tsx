/** R8 review: the range widgets show what the server sent, and nothing it did not. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WidgetBody, type DashboardData } from './widgets';

const base = {
  production: { produced: [{ unit: 'KG', qty: 1200 }], waste: [{ unit: 'KG', qty: 8 }], machinesRun: 1, entries: 2 },
  series: [{ date: '1 Nov', produced: 1200, waste: 8 }],
  seriesUnit: 'KG',
  qc: { critical: 1, major: 2, minor: 3 },
} as unknown as DashboardData;

describe('output and wastage', () => {
  it('a single unit is labelled with that unit, not a fixed Nos or Kg', () => {
    render(<WidgetBody widgetKey="output.yesterday" data={base} />);
    expect(screen.getByText('1,200')).toBeTruthy();
    expect(screen.getByText('KG')).toBeTruthy();
    expect(screen.queryByText('Nos')).toBeNull();
  });

  it('mixed units stay apart, under no single label', () => {
    const production = { ...base.production!, waste: [{ unit: 'KG', qty: 8 }, { unit: 'PIECE', qty: 3 }] };
    render(<WidgetBody widgetKey="wastage.yesterday" data={{ ...base, production }} />);
    expect(screen.getByText('8 KG · 3 PIECE')).toBeTruthy();
    expect(screen.queryByText('Kg')).toBeNull();
  });

  it('the chart names the unit it draws', () => {
    render(<WidgetBody widgetKey="output.againstPlan" data={base} />);
    expect(screen.getByText(/\(KG\)/)).toBeTruthy();
  });
});

describe('AQL widget', () => {
  it('without ceilings shows the counts and no verdict, so the limit cannot be worked out', () => {
    render(<WidgetBody widgetKey="qc.aqlThisMonth" data={base} />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('within')).toBeNull();
    expect(screen.queryByText('over')).toBeNull();
  });

  it('with ceilings shows the verdict', () => {
    const qc = { ...base.qc!, ceilings: { critical: 0, major: 5, minor: 5 } };
    render(<WidgetBody widgetKey="qc.aqlThisMonth" data={{ ...base, qc }} />);
    expect(screen.getAllByText('within')).toHaveLength(2);
    expect(screen.getByText('over')).toBeTruthy();
  });
});
