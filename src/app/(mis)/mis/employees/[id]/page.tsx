import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { getEmployee } from '@/server/mis/employee';
import { getMonthlyAttendance } from '@/server/mis/attendance';
import { notFound } from 'next/navigation';
import { EmployeeProfileScreen } from '@/components/mis/employees/employee-profile-screen';

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'employees.write');

  const employee = await getEmployee(id);
  if (!employee) notFound();

  const now = new Date();
  const attendance = await getMonthlyAttendance(id, now.getFullYear(), now.getMonth() + 1);

  const present = attendance.filter((a: any) => ['PRESENT', 'HALF_DAY'].includes(a.status)).length;
  const absent = attendance.filter((a: any) => a.status === 'ABSENT').length;
  const leave = attendance.filter((a: any) => a.status === 'LEAVE').length;
  const totalOT = attendance.reduce((s: number, a: any) => s + (a.otMinutes ?? 0), 0);

  return (
    <EmployeeProfileScreen
      employee={{
        id: employee.id,
        name: employee.name,
        nameHi: employee.nameHi,
        code: employee.employeeCode,
        role: employee.role,
        isActive: employee.isActive,
        createdAt: employee.createdAt,
      }}
      monthStats={{ present, absent, leave, totalOT }}
      canWrite={canWrite}
    />
  );
}
