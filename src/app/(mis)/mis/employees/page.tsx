import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listEmployees } from '@/server/mis/employee';
import { getMisRole } from '@/server/mis/roles';
import { isPoolScoped } from '@/server/mis/visibility';
import { EmployeeScreen } from '@/components/mis/employees/employee-screen';

export default async function EmployeesPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const [employees, canWrite, scoped] = await Promise.all([
    listEmployees(),
    checkPermission('employees.write'),
    // No MIS role means listEmployees() has already refused the request, so
    // the fallback here is only ever reached on the way to that error.
    role ? isPoolScoped({ userId: user.id, role }) : Promise.resolve(false),
  ]);
  return <EmployeeScreen employees={employees} canWrite={canWrite} scoped={scoped} />;
}
