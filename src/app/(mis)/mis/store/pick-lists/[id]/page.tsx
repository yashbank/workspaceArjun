import { notFound } from 'next/navigation';

import { PickListDetailScreen } from '@/components/mis/store/pick-list-screens';
import { isUuid } from '@/lib/mis/ids';
import { toPlain } from '@/lib/mis/plain';
import { checkPermission } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { getPickList } from '@/server/mis/pick-list';

export default async function PickListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const list = await getPickList(id);
  if (!list) notFound();
  const canWrite = await checkPermission('store.write');
  return <PickListDetailScreen list={toPlain(list)} canWrite={canWrite} />;
}
