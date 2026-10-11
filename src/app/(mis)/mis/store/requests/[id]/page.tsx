import { notFound } from 'next/navigation';

import { RequestDetailScreen } from '@/components/mis/store/request-detail-screen';
import { isUuid } from '@/lib/mis/ids';
import { toPlain } from '@/lib/mis/plain';
import { checkPermission } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { getMaterialRequest } from '@/server/mis/material-request';

export default async function MaterialRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const request = await getMaterialRequest(id);
  if (!request) notFound();
  const canDecide = await checkPermission('store.write');
  return <RequestDetailScreen request={toPlain(request)} canDecide={canDecide} />;
}
