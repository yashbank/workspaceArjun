import { requireMisAccess } from '@/server/mis/guard';
import { can } from '@/lib/mis/permissions';
import { assignableRoles } from '@/lib/mis/roles';
import { getMisRole } from '@/server/mis/roles';
import { getMisSeatSummary, listMisUsers, listPendingMisGrants } from '@/server/mis/users';
import { UsersScreen } from '@/components/mis/settings/users-screen';

export default async function MisUsersPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canInvite = can(role, 'users.invite');

  const [users, seats, pendingGrants] = await Promise.all([
    listMisUsers(),
    getMisSeatSummary(),
    canInvite ? listPendingMisGrants() : Promise.resolve([]),
  ]);

  return (
    <UsersScreen
      users={users}
      seats={seats}
      pendingGrants={pendingGrants}
      canInvite={canInvite}
      assignableRoles={assignableRoles(role)}
    />
  );
}
