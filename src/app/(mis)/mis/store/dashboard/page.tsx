import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { getStoreDashboard } from '@/server/mis/store';
import { StoreDashboardScreen } from '@/components/mis/store/store-dashboard-screen';

export default async function StoreDashboardPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const stats = await getStoreDashboard();

  return <StoreDashboardScreen stats={stats} isOwner={role === 'OWNER'} />;
}
