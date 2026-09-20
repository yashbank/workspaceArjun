import { Card, CardRow } from '@/components/mis/kit/card';
import { RoleBadge } from '@/components/mis/roles/role-badge';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisEmployee, getMisRole } from '@/server/mis/roles';

/**
 * The "Me" tab.
 *
 * Every role whose bottom bar ends in Me needs somewhere for it to land, and
 * /mis/settings is not it — that page is business rules, which most roles may
 * not read. This is the account itself: who the register thinks you are.
 */
export default async function MisMePage() {
  const user = await requireMisAccess();
  const [role, employee] = await Promise.all([getMisRole(user.id), getMisEmployee(user.id)]);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">{employee?.name ?? user.name ?? 'Me'}</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">
          {employee?.employeeCode ?? 'No employee code'}
        </p>
      </section>

      <Card>
        <CardRow label="Signed in as" value={user.email} />
        <CardRow label="MIS role" value={<RoleBadge role={role} />} />
        <CardRow label="Hindi name" value={employee?.nameHi ?? '—'} />
      </Card>
    </div>
  );
}
