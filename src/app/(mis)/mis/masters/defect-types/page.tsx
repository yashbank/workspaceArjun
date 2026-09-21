import { MasterDataDesktopServer } from '@/components/mis/desktop/master-data-desktop-server';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listDefectTypes } from '@/server/mis/defect-type';
import { DefectTypeScreen } from '@/components/mis/masters/defect-type-screen';

export default async function DefectTypesPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; deactivated?: string; edit?: string; create?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireMisAccess();
  const [defectTypes, canWrite] = await Promise.all([
    listDefectTypes(),
    checkPermission('masters.write'),
  ]);
  const phone = <DefectTypeScreen defectTypes={defectTypes} canWrite={canWrite} />;

  // D10 from 1024px up; the existing screen below it. ANY explicit `?view` is the existing screen at every width.
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <MasterDataDesktopServer master="defect-types" searchParams={sp} />
      </div>
    </>
  );
}
