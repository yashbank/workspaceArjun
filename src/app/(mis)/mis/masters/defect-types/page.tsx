import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listDefectTypes } from '@/server/mis/defect-type';
import { DefectTypeScreen } from '@/components/mis/masters/defect-type-screen';

export default async function DefectTypesPage() {
  await requireMisAccess();
  const [defectTypes, canWrite] = await Promise.all([
    listDefectTypes(),
    checkPermission('masters.write'),
  ]);
  return <DefectTypeScreen defectTypes={defectTypes} canWrite={canWrite} />;
}
