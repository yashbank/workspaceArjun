import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { MisForbiddenError } from '@/server/mis/auth';
import { listEmployeeRoster } from '@/server/mis/employee';
import { ExtraPayProposeScreen } from '@/components/mis/attendance/extra-pay-propose-screen';

/**
 * 25.4/D28 — Admin and Super Attendance Operator propose an extra-pay day; the Owner approves it
 * from `/mis/approvals`. Gated on `attendance.write` (not `wages.read` — D28 names these two roles
 * explicitly, and proposing a value is not the same door as reading one back, F-15's precedent).
 * `proposeExtraPayDay` itself refuses too; this is the page's own line, same pattern as payroll/page.tsx.
 */
export default async function ExtraPayProposePage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'attendance.write')) throw new MisForbiddenError('attendance.write');
  const employees = await listEmployeeRoster();
  return <ExtraPayProposeScreen employees={employees.map((e) => ({ id: e.id, name: e.name, employeeCode: e.employeeCode }))} />;
}
