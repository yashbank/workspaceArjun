import { resolveShiftAt } from '@/lib/mis/shift-window';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { can } from '@/lib/mis/permissions';
import { listShifts } from '@/server/mis/attendance';
import { requireMisAccess } from '@/server/mis/guard';
import { getMachineBoard } from '@/server/mis/machines-board';
import { getMisRole } from '@/server/mis/roles';
import { getWorkerAvailability } from '@/server/mis/worker-allocation';
import { WorkerBoardScreen } from '@/components/mis/machines/worker-board-screen';

export default async function CrewPage({
  searchParams,
}: {
  searchParams: Promise<{ shift?: string }>;
}) {
  const { shift: shiftParam } = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'production.write');

  const [machines, shifts] = await Promise.all([getMachineBoard(), listShifts()]);

  const now = new Date();
  const currentShift = resolveShiftAt(shifts, now, await getFactoryTimezone());
  const shiftId = shiftParam ?? currentShift?.id ?? shifts[0]?.id ?? null;

  const availability = shiftId ? await getWorkerAvailability(shiftId, now) : [];

  const staffedMachines = machines
    .filter((m) => m.currentAllocation)
    .map((m) => ({
      machineId: m.id,
      machineAllocationId: m.currentAllocation!.id,
      machineName: m.name,
      orderNumber: m.currentAllocation!.order?.orderNumber ?? null,
      jobRef: m.currentAllocation!.jobRef ?? null,
    }));

  return (
    <WorkerBoardScreen
      shifts={shifts.map((s) => ({ id: s.id, name: s.name }))}
      currentShiftId={shiftId}
      machines={staffedMachines}
      availability={availability}
      canWrite={canWrite}
      allocationDate={now.toISOString()}
    />
  );
}
