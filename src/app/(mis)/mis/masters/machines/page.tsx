import { MasterDataDesktopServer } from '@/components/mis/desktop/master-data-desktop-server';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listMachines } from '@/server/mis/machine';
import { listDepts } from '@/server/mis/department';
import { MachineScreen } from '@/components/mis/machines/machine-screen';

export default async function MachinesPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; deactivated?: string; edit?: string; create?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireMisAccess();
  const [machines, depts, canWrite] = await Promise.all([
    listMachines(),
    listDepts(),
    checkPermission('masters.write'),
  ]);
  const phone = <MachineScreen machines={machines as any} depts={depts} canWrite={canWrite} />;

  // D10 from 1024px up; the existing screen below it. ANY explicit `?view` is the existing screen at every width.
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <MasterDataDesktopServer master="machines" searchParams={sp} />
      </div>
    </>
  );
}
