import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { listAllShifts } from '@/server/mis/attendance';
import { ShiftsScreen } from '@/components/mis/attendance/shifts-screen';
import { ShiftRosterSection } from '@/components/mis/attendance/shift-roster-section';
import { listRoster, listRosterEmployees } from '@/server/mis/shift-roster';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { addDaysToDateKey, factoryDateKey } from '@/lib/mis/factory-time';
import { PageBack } from '@/components/mis/common/page-back';

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'attendance.write');
  const shifts = await listAllShifts();
  const { from: fromParam } = await searchParams;
  const todayKey = factoryDateKey(new Date(), await getFactoryTimezone());
  const base = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : todayKey;
  const weekday = new Date(`${base}T00:00:00Z`).getUTCDay();
  const weekStart = addDaysToDateKey(base, -((weekday + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDaysToDateKey(weekStart, i));
  const [roster, people] = await Promise.all([listRoster({ from: days[0], to: days[6] }), listRosterEmployees()]);
  return (
    <>
      <PageBack href="/mis/attendance" label="Attendance" />
      <ShiftsScreen
        shifts={shifts.map(s => ({
          id: s.id,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          isDefault: s.isDefault,
          isActive: s.isActive,
        }))}
        canWrite={canWrite}
      />
      <div className="mx-auto max-w-5xl pb-8">
        <ShiftRosterSection
          shifts={shifts.map(s => ({ id: s.id, name: s.name, isActive: s.isActive }))}
          employees={people}
          rows={roster}
          days={days}
          prevFrom={addDaysToDateKey(weekStart, -7)}
          nextFrom={addDaysToDateKey(weekStart, 7)}
          canWrite={can(role, 'roster.write')} // R2-263
        />
      </div>
    </>
  );
}
