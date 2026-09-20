import { requireMisAccess } from '@/server/mis/guard';
import { getBom } from '@/server/mis/bom';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { BomScreen } from '@/components/mis/bom/bom-screen';

export default async function BomDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'orders.write');
  const isOwner = can(role, 'wages.read');
  const bom = await getBom(orderId);
  return <BomScreen bom={bom as any} orderId={orderId} canWrite={canWrite} isOwner={isOwner} />;
}
