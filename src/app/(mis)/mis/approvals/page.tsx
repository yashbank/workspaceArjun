import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { getPendingApprovals } from '@/server/mis/approvals';
import { ApprovalsScreen } from '@/components/mis/approvals/approvals-screen';

export default async function ApprovalsPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const isOwner = can(role, 'wages.read');
  const canWrite = can(role, 'orders.write');
  const pending = await getPendingApprovals();
  return <ApprovalsScreen pending={pending as any} isOwner={isOwner} canWrite={canWrite} />;
}
