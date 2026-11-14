/** R2-405 — crew board: KPI strip from loaded data, IconAction names unchanged, no max-w / py-6 wrapper. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/app/(mis)/mis/crew/actions', () => ({
  assignWorkersAction: vi.fn(), releaseWorkerAction: vi.fn(), moveWorkerAction: vi.fn(), copyCrewAction: vi.fn(),
}));

const { WorkerBoardScreen } = await import('./worker-board-screen');

const M = { machineId: 'm1', machineAllocationId: 'ma-1', machineName: 'Heidelberg', orderNumber: 'ORD-1', jobRef: null };
const w = (id: string, allocations: unknown[] = []) => ({ employeeId: id, name: id, employeeCode: id, clockedIn: true, presence: 'IN' as const, allocations });

describe('R2-405 crew board', () => {
  it('shows 4 KPI cards, icon actions keep their names, wrapper is full width', () => {
    const blockedEntry = { id: 'a1', machineAllocationId: 'ma-1', machineId: 'm1', machineName: 'Heidelberg', orderNumber: 'ORD-1', processName: null, holderName: 'X', canRelease: true };
    const { container } = render(
      <WorkerBoardScreen shifts={[]} currentShiftId="s1" dateKey="2026-10-19" minDate="2026-10-19" maxDate="2026-10-26" machines={[M]}
        availability={[w('e1'), w('e2', [blockedEntry])] as never} canWrite canOverride={false} openAllocationId={null} />,
    );
    expect(screen.getAllByTestId('crew-kpi-card')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Release' })).toBeTruthy();
    expect(container.innerHTML).not.toContain('max-w-4xl');
    expect(container.innerHTML).not.toContain('py-6"');
  });
});
