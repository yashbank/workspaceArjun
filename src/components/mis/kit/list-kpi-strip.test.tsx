import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListKpiStrip } from './list-kpi-strip';

describe('ListKpiStrip', () => {
  it('renders one card per kpi with its count and hint', () => {
    render(<ListKpiStrip label="Summary" kpis={[{ label: 'Total', value: 7 }, { label: 'Late', value: 2, hint: 'on this page', tone: 'bad' }]} />);
    expect(screen.getAllByTestId('list-kpi-card')).toHaveLength(2);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('on this page')).toBeTruthy();
    expect(screen.getByLabelText('Summary')).toBeTruthy();
  });
});
