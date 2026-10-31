import Link from 'next/link';

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

  // R2-221: phone stays a narrow single column; desktop gets a wider card grid.
  return (
    <div className="mx-auto grid w-full max-w-[420px] grid-cols-1 gap-3 pb-24 md:max-w-4xl md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2">
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

      {/* R2-172: my own attendance - days worked, punches, late and overtime. */}
      {employee && (
        <Link
          href="/mis/me/attendance"
          className="flex min-h-11 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          My attendance
          <span aria-hidden="true" className="text-slate-400">→</span>
        </Link>
      )}

      {/* R2-111: the payslips the Owner has sent this person (previous months only). */}
      {employee && (
        <Link
          href="/mis/me/payslips"
          className="flex min-h-11 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          My payslips
          <span aria-hidden="true" className="text-slate-400">→</span>
        </Link>
      )}

      {/* R2-220: my leave - history, apply, withdraw a pending one. */}
      {employee && (
        <Link
          href="/mis/me/leaves"
          className="flex min-h-11 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          My leave
          <span aria-hidden="true" className="text-slate-400">→</span>
        </Link>
      )}

      {/* R2-222: missed punch - ask for a day's punch to be fixed. */}
      {employee && (
        <Link
          href="/mis/me/regularization"
          className="flex min-h-11 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Missed punch
          <span aria-hidden="true" className="text-slate-400">→</span>
        </Link>
      )}
    </div>
  );
}
