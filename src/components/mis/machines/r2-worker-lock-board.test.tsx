/** R2-47 — the crew board shows Available vs Blocked; Blocked names machine + holder; only the holder/Admin/Owner gets Release. */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/app/(mis)/mis/crew/actions', () => ({
  assignWorkersAction: vi.fn(), releaseWorkerAction: vi.fn(), moveWorkerAction: vi.fn(), copyCrewAction: vi.fn(),
}));

const { WorkerBoardScreen } = await import('./worker-board-screen');

const MACHINE = { machineId: 'm1', machineAllocationId: 'ma-1', machineName: 'Heidelberg', orderNumber: 'ORD-1', jobRef: null };
const entry = (over: Record<string, unknown> = {}) => ({ id: 'w1', machineAllocationId: 'ma-1', machineId: 'm1', machineName: 'Heidelberg', orderNumber: 'ORD-1', processName: null, holderName: 'Supervisor A', ...over });
const person = (id: string, name: string, allocations: ReturnType<typeof entry>[] = []) => ({
  employeeId: id, name, employeeCode: id.toUpperCase(), clockedIn: true, presence: 'IN' as const, allocations,
});
const board = (availability: ReturnType<typeof person>[], over: Record<string, unknown> = {}) => (
  <WorkerBoardScreen shifts={[]} currentShiftId="s1" dateKey="2026-10-19" minDate="2026-10-19" maxDate="2026-10-26"
    machines={[MACHINE, { ...MACHINE, machineAllocationId: 'ma-2', machineId: 'm2', machineName: 'Bobst' }]}
    availability={availability} canWrite canOverride={false} openAllocationId={null} {...over} />
);

describe('R2-47 crew board', () => {
  it('splits Available and Blocked, and a blocked row names the machine and the holder', () => {
    render(board([person('e1', 'Ramesh'), person('e2', 'Suresh', [entry({ canRelease: false })])]));
    const available = screen.getByRole('region', { name: 'Available workers' });
    const blocked = screen.getByRole('region', { name: 'Blocked workers' });
    expect(within(available).getByText('Ramesh')).toBeTruthy();
    expect(within(available).queryByText('Suresh')).toBeNull();
    expect(within(blocked).getByText('Suresh')).toBeTruthy();
    expect(within(blocked).getByText(/Heidelberg · ORD-1 · held by Supervisor A/)).toBeTruthy();
    expect(screen.getByText('Available (1)')).toBeTruthy();
    expect(screen.getByText('Blocked (1)')).toBeTruthy();
  });

  it('a supervisor who does not hold the lock gets no Release or Move', () => {
    render(board([person('e2', 'Suresh', [entry({ canRelease: false })])]));
    expect(screen.queryByRole('button', { name: 'Release' })).toBeNull();
    expect(screen.queryByLabelText(/Move Suresh/)).toBeNull();
  });

  it('the holder (or Admin/Owner) gets Release and Move', () => {
    render(board([person('e2', 'Suresh', [entry({ canRelease: true })])]));
    expect(screen.getByRole('button', { name: 'Release' })).toBeTruthy();
    expect(screen.getByLabelText(/Move Suresh/)).toBeTruthy();
  });

  it('in the Assign panel a person locked to another machine cannot be picked by a supervisor; an Admin may', () => {
    const rows = [person('e2', 'Suresh', [entry({ machineAllocationId: 'ma-2', machineName: 'Bobst' })])];
    const { unmount } = render(board(rows, { openAllocationId: 'ma-1' }));
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByLabelText(/Suresh/) as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByText(/Blocked: Bobst \(held by Supervisor A\)/)).toBeTruthy();
    unmount();
    render(board(rows, { openAllocationId: 'ma-1', canOverride: true }));
    expect((within(screen.getByRole('dialog')).getByLabelText(/Suresh/) as HTMLInputElement).disabled).toBe(false);
  });
});
