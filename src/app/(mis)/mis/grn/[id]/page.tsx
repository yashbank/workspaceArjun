import { notFound } from 'next/navigation';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { getGRN } from '@/server/mis/grn';
import { GrnDetailScreen } from '@/components/mis/grn/grn-detail-screen';

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMisAccess();
  const grn = await getGRN(id);
  if (!grn) notFound();
  const canWrite = await checkPermission('grn.write');
  return <GrnDetailScreen grn={grn} canWrite={canWrite} />;
}
