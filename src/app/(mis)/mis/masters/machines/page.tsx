import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listMachines } from '@/server/mis/machine';
import { listDepts } from '@/server/mis/department';
import { MachineScreen } from '@/components/mis/machines/machine-screen';

export default async function MachinesPage() {
  await requireMisAccess();
  const [machines, depts, canWrite] = await Promise.all([
    listMachines(),
    listDepts(),
    checkPermission('masters.write'),
  ]);
  return <MachineScreen machines={machines as any} depts={depts} canWrite={canWrite} />;
}
