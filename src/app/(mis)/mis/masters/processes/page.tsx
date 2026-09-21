import { MasterDataDesktopServer } from '@/components/mis/desktop/master-data-desktop-server';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listProcesses } from '@/server/mis/process';
import { listDepts } from '@/server/mis/department';
import { ProcessScreen } from '@/components/mis/processes/process-screen';

export default async function ProcessesPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; deactivated?: string; edit?: string; create?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireMisAccess();
  const [processes, depts, canWrite] = await Promise.all([listProcesses(), listDepts(), checkPermission('masters.write')]);
  const phone = <ProcessScreen processes={processes as any} depts={depts} canWrite={canWrite} />;

  // D10 from 1024px up; the existing screen below it. ANY explicit `?view` is the existing screen at every width.
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <MasterDataDesktopServer master="processes" searchParams={sp} />
      </div>
    </>
  );
}
