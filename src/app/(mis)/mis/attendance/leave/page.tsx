import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { listLeaveRequests } from '@/server/mis/attendance';
import { listEmployees } from '@/server/mis/employee';
import { LeaveScreen } from '@/components/mis/attendance/leave-screen';
import { PageBack } from '@/components/mis/common/page-back';

export default async function LeavePage({ searchParams }: { searchParams: { employeeId?: string } }) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canApprove = can(role, 'attendance.write');

  const [leaves, employees] = await Promise.all([
    listLeaveRequests(),
    listEmployees(),
  ]);

  const sp = await searchParams;
  const initialEmployeeId = sp.employeeId;

  return (
    <>
      <PageBack href="/mis/attendance" label="Attendance" />
      <LeaveScreen
        leaves={leaves.map(l => ({
          id: l.id,
          date: l.date,
          endDate: l.endDate,
          leaveType: l.leaveType,
          status: l.status,
          reason: l.reason,
          employee: l.employee,
        }))}
        employees={employees.filter(e => e.isActive).map(e => ({ id: e.id, name: e.name, employeeCode: e.employeeCode }))}
        canApprove={canApprove}
        initialEmployeeId={initialEmployeeId}
      />
    </>
  );
}
