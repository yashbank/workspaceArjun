import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { can } from '@/lib/mis/permissions';
import { listEmployees } from '@/server/mis/employee';
import { listWageCodes } from '@/server/mis/wage-type';
import { getMisRole } from '@/server/mis/roles';
import { isPoolScoped } from '@/server/mis/visibility';
import { EmployeeScreen } from '@/components/mis/employees/employee-screen';

export default async function EmployeesPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const isOwner = can(role, 'wages.read');
  const [employees, canWrite, scoped, wageCodes] = await Promise.all([
    listEmployees(),
    checkPermission('employees.write'),
    // No MIS role means listEmployees() has already refused the request, so
    // the fallback here is only ever reached on the way to that error.
    role ? isPoolScoped({ userId: user.id, role }) : Promise.resolve(false),
    // Phase 25 (25.2): the wage-code picker on this screen. `listWageCodes` is `wages.read`
    // (Owner only, same door as the rest of the wage-type subsystem) — an Admin who can edit
    // employees still never sees the options list, matching D24's "the server does not send it".
    isOwner ? listWageCodes() : Promise.resolve([]),
  ]);
  return <EmployeeScreen employees={employees} canWrite={canWrite} scoped={scoped} isOwner={isOwner} wageCodes={wageCodes} />;
}
