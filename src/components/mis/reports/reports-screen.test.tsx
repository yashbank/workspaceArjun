/**
 * E7-11 — the new "Machines" tab on `/mis/reports` (the phone/classic tabbed screen). Booked
 * time, not actual running time, and never a claim about when a machine was down (F-14, no such
 * record exists yet) — the screen must say so, not imply more precision than the data supports.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ReportsScreen } from './reports-screen';

const baseProps = {
  production: { rows: [], raw: [] },
  attendance: { rows: [], raw: [] },
  qc: { rows: [], raw: [] },
  orders: [],
  store: { rows: [], raw: [] },
  canSeeWages: false,
  isOwner: false,
  rangeLabel: 'September 2026',
  year: 2026,
  month: 9,
};

const machinesProp = (rows: { machineId: string; code: string; name: string; isActive: boolean; bookedMinutes: number; allocationCount: number; percent: number }[]) => ({
  rows,
  availableMinutes: 43200,
  totals: {
    bookedMinutes: rows.reduce((s, r) => s + r.bookedMinutes, 0),
    allocationCount: rows.reduce((s, r) => s + r.allocationCount, 0),
    machineCount: rows.length,
  },
});

function openMachinesTab() {
  fireEvent.click(screen.getByRole('button', { name: 'Machines' }));
}

// DataTable (the kit component) renders both the desktop table and the phone card layout at
// once, switching which is visible with CSS (D3) — every row's content appears twice in the DOM.
describe('the Machines tab', () => {
  it('lists each machine with its booked hours and utilisation percent', () => {
    const machines = machinesProp([{ machineId: 'm1', code: 'MC-01', name: 'Heidelberg SM 74', isActive: true, bookedMinutes: 720, allocationCount: 3, percent: 50 }]);
    render(<ReportsScreen {...baseProps} machines={machines} />);
    openMachinesTab();
    expect(screen.getAllByText('Heidelberg SM 74').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MC-01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12.0h').length).toBeGreaterThan(0);
  });

  it('flags a currently-inactive machine without claiming it was down for the whole period', () => {
    const machines = machinesProp([{ machineId: 'm1', code: 'MC-01', name: 'Old Press', isActive: false, bookedMinutes: 0, allocationCount: 0, percent: 0 }]);
    render(<ReportsScreen {...baseProps} machines={machines} />);
    openMachinesTab();
    expect(screen.getAllByText('(currently inactive)').length).toBeGreaterThan(0);
  });

  it('says plainly that the figure is booked time, not actual running time or downtime history', () => {
    render(<ReportsScreen {...baseProps} machines={machinesProp([])} />);
    openMachinesTab();
    expect(screen.getByText(/not actual running time, and not a claim about when a machine was down/i)).toBeTruthy();
  });

  it('an empty machines list shows the empty state, not a blank table', () => {
    render(<ReportsScreen {...baseProps} machines={machinesProp([])} />);
    openMachinesTab();
    expect(screen.getByText('No machines')).toBeTruthy();
  });

  it('the summary tile averages utilisation across all machines', () => {
    const machines = machinesProp([
      { machineId: 'm1', code: 'A', name: 'A', isActive: true, bookedMinutes: 100, allocationCount: 1, percent: 80 },
      { machineId: 'm2', code: 'B', name: 'B', isActive: true, bookedMinutes: 10, allocationCount: 1, percent: 20 },
    ]);
    render(<ReportsScreen {...baseProps} machines={machines} />);
    expect(screen.getByText('Machine Utilisation')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy(); // (80+20)/2
  });

  it('no machines at all reads an em dash, not 0% or NaN', () => {
    render(<ReportsScreen {...baseProps} machines={machinesProp([])} />);
    expect(screen.getByText('Machine Utilisation').nextSibling?.textContent).toBe('—');
  });
});
