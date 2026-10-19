import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { can } from '@/lib/mis/permissions';
import { clampPage, parsePage, parseSearch } from '@/lib/mis/pagination';
import { listEmployees, listEmployeesPage } from '@/server/mis/employee';
import { listDepts } from '@/server/mis/department';
import { listWageCodes } from '@/server/mis/wage-type';
import { getMisRole } from '@/server/mis/roles';
import { isPoolScoped } from '@/server/mis/visibility';
import { EmployeeScreen } from '@/components/mis/employees/employee-screen';

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ edit?: string; q?: string; page?: string }> }) {
  const { edit, q: rawQ, page } = await searchParams;
  const q = parseSearch(rawQ);
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const isOwner = can(role, 'wages.read');
  const canWriteEmployees = await checkPermission('employees.write');
  const [paged, everyone, canWrite, scoped, wageCodes, depts] = await Promise.all([
    listEmployeesPage({ q, page }),
    // The manager picker (and ?edit=) need the whole D4-scoped roll, not just this page.
    listEmployees(),
    Promise.resolve(canWriteEmployees),
    // No MIS role means listEmployees() has already refused the request, so
    // the fallback here is only ever reached on the way to that error.
    role ? isPoolScoped({ userId: user.id, role }) : Promise.resolve(false),
    // Phase 25 (25.2): the wage-code picker on this screen. `listWageCodes` is `wages.read`
    // (Owner only, same door as the rest of the wage-type subsystem) — an Admin who can edit
    // employees still never sees the options list, matching D24's "the server does not send it".
    isOwner ? listWageCodes() : Promise.resolve([]),
    // R2-86: the Department picker; a role that cannot read masters simply gets none (the field is hidden).
    canWriteEmployees ? listDepts().catch(() => []) : Promise.resolve([]),
  ]);
  return <EmployeeScreen employees={paged.rows} allPeople={everyone} paging={{ total: paged.total, page: clampPage(parsePage(page), paged.total), params: { q } }} canWrite={canWrite} scoped={scoped} isOwner={isOwner} wageCodes={wageCodes} departments={depts.map((d) => ({ id: d.id, name: d.name }))} initialEditId={canWriteEmployees && edit && isUuid(edit) ? edit : undefined} />;
}
