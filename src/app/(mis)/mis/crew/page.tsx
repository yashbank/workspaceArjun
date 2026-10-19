import { WorkerBoardScreen } from '@/components/mis/machines/worker-board-screen';
import { Forbidden } from '@/components/mis/forbidden';
import { isDateKey, shiftDateKeyFor } from '@/lib/mis/crew-hours';
import { addDaysToDateKey, factoryDateKey } from '@/lib/mis/factory-time';
import { can } from '@/lib/mis/permissions';
import { resolveShiftAt } from '@/lib/mis/shift-window';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { getWorkerAvailability, getWorkerLocks, listActiveShifts, listCrewBookings } from '@/server/mis/worker-allocation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The crew board for one date and shift (R3 B93).
 *
 * `?date=YYYY-MM-DD&shift=<uuid>&allocation=<uuid>`; a bad value falls back to the default rather
 * than failing (R3 B94): today and the current shift. `allocation` opens that booking's Assign
 * slide-over. The page needs `production.read`; anyone else gets the calm Forbidden screen, not
 * the error boundary.
 */
export default async function CrewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; shift?: string; allocation?: string }>;
}) {
  const params = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'production.read')) return <Forbidden />;
  const canWrite = can(role, 'production.write');

  const now = new Date();
  const tz = await getFactoryTimezone();
  const shifts = await listActiveShifts();

  const requested = params.shift && UUID.test(params.shift) ? shifts.find((s) => s.id === params.shift) : undefined;
  const shift = requested ?? resolveShiftAt(shifts, now, tz) ?? shifts[0] ?? null;

  const today = factoryDateKey(now, tz);
  const defaultDate = shift ? shiftDateKeyFor(shift, now, tz) : today;
  const minDate = defaultDate < today ? defaultDate : today;
  const maxDate = addDaysToDateKey(today, 7);
  const dateKey =
    params.date && isDateKey(params.date) && params.date >= minDate && params.date <= maxDate ? params.date : defaultDate;

  const [bookings, availability, locks] = shift
    ? await Promise.all([listCrewBookings(dateKey, shift.id), getWorkerAvailability(shift.id, dateKey), getWorkerLocks(shift.id, dateKey)])
    : [[], [], {} as Awaited<ReturnType<typeof getWorkerLocks>>];

  const openAllocationId =
    params.allocation && UUID.test(params.allocation) && bookings.some((b) => b.machineAllocationId === params.allocation)
      ? params.allocation
      : null;

  return (
    <WorkerBoardScreen
      shifts={shifts.map((s) => ({ id: s.id, name: s.name }))}
      currentShiftId={shift?.id ?? null}
      dateKey={dateKey}
      minDate={minDate}
      maxDate={maxDate}
      machines={bookings.map((b) => ({
        machineId: b.machineId,
        machineAllocationId: b.machineAllocationId,
        machineName: b.machineName,
        orderNumber: b.orderNumber,
        jobRef: b.jobRef,
      }))}
      availability={availability.map((w) => ({
        ...w,
        // R2-47: who holds each lock, and whether this viewer may release it (the server re-checks).
        allocations: w.allocations.map((a) => ({ ...a, holderName: locks[a.id]?.holderName ?? null, canRelease: locks[a.id]?.canRelease ?? true })),
      }))}
      canWrite={canWrite}
      canOverride={role === 'OWNER' || role === 'ADMIN'}
      openAllocationId={openAllocationId}
    />
  );
}
