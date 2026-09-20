import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listDepts } from '@/server/mis/department';
import { DepartmentScreen } from '@/components/mis/departments/department-screen';

export default async function DepartmentsPage() {
  await requireMisAccess();
  const [depts, canWrite] = await Promise.all([
    listDepts(),
    checkPermission('masters.write'),
  ]);
  return <DepartmentScreen depts={depts} canWrite={canWrite} />;
}
