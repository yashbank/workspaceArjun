import { requireMisAccess } from '@/server/mis/guard';
import { getMachineBoard } from '@/server/mis/machines-board';
import { MachineBoardScreen } from '@/components/mis/machine-board/machine-board-screen';
import { can } from '@/lib/mis/permissions';
import { getMisRole } from '@/server/mis/roles';

export default async function MachineBoardPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'production.write');
  const machines = await getMachineBoard();
  return <MachineBoardScreen machines={machines} canWrite={canWrite} />;
}
