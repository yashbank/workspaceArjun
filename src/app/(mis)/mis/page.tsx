import { RoleBadge } from '@/components/mis/roles/role-badge';
import { Card, CardRow } from '@/components/mis/kit/card';
import { getMisRole } from '@/server/mis/roles';
import { requireMisAccess } from '@/server/mis/guard';

/**
 * MIS home.
 *
 * A placeholder by design (E1-01): it proves the route, the guard, the role
 * resolution and the shell all work end to end, and nothing more. The
 * role-aware home screens land with their own epics.
 */
export default async function MisHomePage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Bhaskar Paper Products</h1>

      <Card>
        <CardRow label="Name" value={user.name ?? '—'} />
        <CardRow label="Email" value={user.email} />
        <CardRow label="MIS role" value={<RoleBadge role={role} />} />
      </Card>

      <p className="text-sm text-slate-500">
        Masters, orders, production, quality and attendance arrive with their own
        tickets. This screen exists to prove the frame.
      </p>
    </div>
  );
}
