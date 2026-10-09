import { RequestListScreen } from '@/components/mis/store/request-list-screen';
import { toPlain } from '@/lib/mis/plain';
import { checkPermission } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { listMaterialRequests } from '@/server/mis/material-request';

export default async function MaterialRequestsPage() {
  await requireMisAccess();
  const [requests, canDecide] = await Promise.all([listMaterialRequests(), checkPermission('store.write')]);
  return <RequestListScreen requests={toPlain(requests)} canDecide={canDecide} />;
}
