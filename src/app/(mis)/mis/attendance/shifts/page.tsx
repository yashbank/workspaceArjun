import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { listAllShifts } from '@/server/mis/attendance';
import { ShiftsScreen } from '@/components/mis/attendance/shifts-screen';
import { PageBack } from '@/components/mis/common/page-back';

export default async function ShiftsPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'attendance.write');
  const shifts = await listAllShifts();
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
    </>
  );
}
