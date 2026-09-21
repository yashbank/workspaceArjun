import { MasterDataDesktopServer } from '@/components/mis/desktop/master-data-desktop-server';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listDepts } from '@/server/mis/department';
import { DepartmentScreen } from '@/components/mis/departments/department-screen';

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; deactivated?: string; edit?: string; create?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireMisAccess();
  const [depts, canWrite] = await Promise.all([
    listDepts(),
    checkPermission('masters.write'),
  ]);
  const phone = <DepartmentScreen depts={depts} canWrite={canWrite} />;

  // D10 from 1024px up; the existing screen below it. ANY explicit `?view` is the existing screen at every width.
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <MasterDataDesktopServer master="departments" searchParams={sp} />
      </div>
    </>
  );
}
