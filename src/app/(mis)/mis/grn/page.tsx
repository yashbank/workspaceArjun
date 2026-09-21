import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { listGRNs } from '@/server/mis/grn';
import { listPOs } from '@/server/mis/po';
import { GrnListScreen } from '@/components/mis/grn/grn-list-screen';

export default async function GrnPage() {
  await requireMisAccess();
  // The purchase orders are only for the "New GRN" form. A role that may READ receipts but not write them (the
  // Supervisor: `grn.read`, no `po.read`) must still see the list — `listPOs()` is refused for them, and asking
  // for it unconditionally denied the whole page (F-24).
  const canWrite = await checkPermission('grn.write');
  const canPickPo = canWrite && (await checkPermission('po.read'));
  const [grns, pos] = await Promise.all([listGRNs(), canPickPo ? listPOs() : Promise.resolve([])]);
  type Po = (typeof pos)[number];
  const approvedPos = pos.filter((p: Po) => ['APPROVED', 'RECEIVING', 'PARTIAL'].includes(p.status));
  return <GrnListScreen grns={grns} approvedPos={approvedPos} canWrite={canWrite} />;
}
