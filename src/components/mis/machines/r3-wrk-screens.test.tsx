/**
 * R3-WRK screens: the crew board (toast after a partial assign, presence chips in order, the
 * confirm before a release) and the machine board (Assign crew link, release wording, sync chip,
 * refusal text inline).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const assign = vi.fn();
const release = vi.fn();
const move = vi.fn();
const copy = vi.fn();
vi.mock('@/app/(mis)/mis/crew/actions', () => ({
  assignWorkersAction: (...a: unknown[]) => assign(...a),
  releaseWorkerAction: (...a: unknown[]) => release(...a),
  moveWorkerAction: (...a: unknown[]) => move(...a),
  copyCrewAction: (...a: unknown[]) => copy(...a),
}));
const allocate = vi.fn();
const releaseMachine = vi.fn();
vi.mock('@/app/(mis)/mis/machine-board/actions', () => ({
  allocateMachineAction: (...a: unknown[]) => allocate(...a),
  releaseMachineAction: (...a: unknown[]) => releaseMachine(...a),
  getOpenPhasesForOrderAction: async () => ({ ok: true, value: [] }),
}));

const { WorkerBoardScreen, sortPickerRows, assignSummary } = await import('./worker-board-screen');
const { MachineBoardScreen, releaseMessage } = await import('@/components/mis/machine-board/machine-board-screen');

const person = (id: string, name: string, presence: 'IN' | 'OUT' | 'LEAVE' | 'ABSENT' | 'NOT_IN') => ({
  employeeId: id, name, employeeCode: id.toUpperCase(), clockedIn: presence === 'IN', presence, allocations: [] as never[],
});
const MACHINE = { machineId: 'm1', machineAllocationId: 'ma-1', machineName: 'Heidelberg', orderNumber: 'ORD-1', jobRef: null };

const board = (availability = [person('e1', 'Ramesh', 'IN'), person('e2', 'Suresh', 'IN')]) => (
  <WorkerBoardScreen
    shifts={[{ id: 's1', name: 'Shift 1' }]} currentShiftId="s1" dateKey="2026-10-13" minDate="2026-10-13" maxDate="2026-10-20"
    machines={[MACHINE]} availability={availability} canWrite canOverride={false} openAllocationId="ma-1"
  />
);

beforeEach(() => vi.clearAllMocks());

describe('crew board', () => {
  it('shows a toast with who was skipped after a partial assign, and keeps the panel for the blocked', async () => {
    assign.mockResolvedValue({
      ok: true,
      value: {
        createdCount: 1, alreadyAssigned: [], warnings: [],
        blocked: [{ employeeId: 'e2', employeeName: 'Suresh', kind: 'ON_LEAVE', conflictingAllocationId: null, conflictingMachineName: null, conflictingProcessName: null, conflictingOrderNumber: null }],
      },
    });
    render(board());
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/Ramesh/));
    fireEvent.click(within(dialog).getByLabelText(/Suresh/));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Assign \(2\)/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('info', 'Assigned 1 · skipped 1 (Suresh)'));
    expect(assign.mock.calls[0][0]).toMatchObject({ allocationDate: '2026-10-13', shiftId: 's1' });
    expect(await screen.findByText(/on approved leave/)).toBeTruthy();
  });

  it('shows a refusal as text', async () => {
    assign.mockResolvedValue({ ok: false, detail: 'Not found or not in your team: e9' });
    render(board());
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/Ramesh/));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Assign \(1\)/ }));
    expect(await screen.findByText('Not found or not in your team: e9')).toBeTruthy();
  });

  it('lists IN first, then the rest, by name', () => {
    const rows = [person('a', 'Anil', 'OUT'), person('b', 'Bala', 'IN'), person('c', 'Chand', 'LEAVE'), person('d', 'Dev', 'NOT_IN'), person('e', 'Esha', 'IN')];
    expect(sortPickerRows(rows).map((r) => r.presence)).toEqual(['IN', 'IN', 'NOT_IN', 'OUT', 'LEAVE']);
    render(board(rows));
    const chips = within(screen.getByRole('dialog')).getAllByTestId('presence-chip').map((c) => c.getAttribute('data-presence'));
    expect(chips).toEqual(['IN', 'IN', 'NOT_IN', 'OUT', 'LEAVE']);
  });

  it('asks before releasing', async () => {
    release.mockResolvedValue({ ok: true, value: undefined });
    const withRow = { ...person('e1', 'Ramesh', 'IN'), allocations: [{ id: 'w1', machineAllocationId: 'ma-1', machineId: 'm1', machineName: 'Heidelberg', orderNumber: 'ORD-1', processName: null }] };
    render(
      <WorkerBoardScreen shifts={[]} currentShiftId="s1" dateKey="2026-10-13" minDate="2026-10-13" maxDate="2026-10-20"
        machines={[MACHINE]} availability={[withRow]} canWrite canOverride={false} openAllocationId={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    expect(release).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Release' }).length).toBeGreaterThan(1));
    fireEvent.click(screen.getAllByRole('button', { name: 'Release' }).at(-1)!);
    await waitFor(() => expect(release).toHaveBeenCalledWith('w1'));
  });

  it('assignSummary words the toast', () => {
    expect(assignSummary(3, [])).toBe('Assigned 3');
    expect(assignSummary(2, ['A', 'B'])).toBe('Assigned 2 · skipped 2 (A, B)');
  });
});

describe('machine board', () => {
  const machine = (over = {}) => ({
    id: 'm1', name: 'Heidelberg', code: 'H1', machineType: null, isActive: true, status: 'BUSY' as const, department: null,
    currentAllocation: { id: 'ma-1', jobRef: null, endsAt: new Date('2026-10-13T08:30:00Z'), order: { orderNumber: 'ORD-1' }, crewNames: ['Ramesh', 'Suresh'] },
    lastLog: null, syncFlag: null, ...over,
  });

  it('links Assign crew to the crew board with the date, shift and booking', () => {
    render(<MachineBoardScreen machines={[machine()]} canWrite orders={[]} crewLink={{ dateKey: '2026-10-13', shiftId: 's1' }} />);
    expect(screen.getByRole('link', { name: 'Assign crew' }).getAttribute('href')).toBe('/mis/crew?date=2026-10-13&shift=s1&allocation=ma-1');
  });

  it('confirms a release with the crew it frees', async () => {
    releaseMachine.mockResolvedValue({ ok: true, value: { alreadyReleased: false, workers: 2 } });
    render(<MachineBoardScreen machines={[machine()]} canWrite orders={[]} crewLink={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    expect(await screen.findByText('Releasing frees 2 workers: Ramesh, Suresh')).toBeTruthy();
    expect(releaseMachine).not.toHaveBeenCalled();
    expect(releaseMessage([])).toBe('Releasing frees 0 workers');
    expect(releaseMessage(['A'])).toBe('Releasing frees 1 worker: A');
  });

  it('shows the sync chip, only when there is something to warn about', () => {
    const { rerender } = render(<MachineBoardScreen machines={[machine({ syncFlag: 'NO_BOOKING' })]} canWrite orders={[]} />);
    expect(screen.getByTestId('sync-chip').textContent).toContain('Log without booking');
    rerender(<MachineBoardScreen machines={[machine({ syncFlag: 'OTHER_ORDER' })]} canWrite orders={[]} />);
    expect(screen.getByTestId('sync-chip').textContent).toContain('Log for another order');
    rerender(<MachineBoardScreen machines={[machine({ syncFlag: 'OK' })]} canWrite orders={[]} />);
    expect(screen.queryByTestId('sync-chip')).toBeNull();
  });

  it('shows "Machine already allocated" inline when the booking is refused', async () => {
    allocate.mockResolvedValue({ ok: false, detail: 'Machine already allocated from 13/10/2026 6:00 am to 13/10/2026 2:00 pm' });
    render(<MachineBoardScreen machines={[machine({ status: 'FREE', currentAllocation: null })]} canWrite orders={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allocate' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(/Machine already allocated from/)).toBeTruthy();
  });
});
