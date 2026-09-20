import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listGRNs } from '@/server/mis/grn';
import { listPOs } from '@/server/mis/po';
import { GrnListScreen } from '@/components/mis/grn/grn-list-screen';

export default async function GrnPage() {
  await requireMisAccess();
  const [grns, pos, canWrite] = await Promise.all([
    listGRNs(),
    listPOs(),
    checkPermission('grn.write'),
  ]);
  type Po = (typeof pos)[number];
  const approvedPos = pos.filter((p: Po) => ['APPROVED', 'RECEIVING', 'PARTIAL'].includes(p.status));
  return <GrnListScreen grns={grns} approvedPos={approvedPos} canWrite={canWrite} />;
}
