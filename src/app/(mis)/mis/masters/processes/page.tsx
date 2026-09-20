import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listProcesses } from '@/server/mis/process';
import { listDepts } from '@/server/mis/department';
import { ProcessScreen } from '@/components/mis/processes/process-screen';

export default async function ProcessesPage() {
  await requireMisAccess();
  const [processes, depts, canWrite] = await Promise.all([listProcesses(), listDepts(), checkPermission('masters.write')]);
  return <ProcessScreen processes={processes as any} depts={depts} canWrite={canWrite} />;
}
