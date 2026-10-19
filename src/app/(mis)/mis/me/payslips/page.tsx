import Link from 'next/link';

import { PageBack } from '@/components/mis/common/page-back';
import { DEFAULT_FACTORY_TIMEZONE, formatFactoryDate } from '@/lib/mis/factory-time';
import { requireMisAccess } from '@/server/mis/guard';
import { listMyPayslips } from '@/server/mis/payslips';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * R2-111 — "My payslips": the months the Owner has sent this person. Previous months only, and only
 * their own; no figure is on this list — each row opens the slip itself.
 */
export default async function MyPayslipsPage() {
  await requireMisAccess();
  const slips = await listMyPayslips();

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24">
      <PageBack href="/mis/me" label="Me" />
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">My payslips</h1>
        <p className="mt-1 text-sm text-slate-500">Payslips appear here once the Owner sends them, for past months only.</p>
      </section>
      {slips.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No payslips have been sent to you yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {slips.map((s) => (
            <li key={`${s.year}-${s.month}`}>
              <Link
                href={`/mis/print/my-payslip?year=${s.year}&month=${s.month}`}
                target="_blank"
                className="flex min-h-11 items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{MONTHS[s.month - 1]} {s.year}</span>
                <span className="text-xs text-slate-500">Sent {formatFactoryDate(new Date(s.releasedAt), DEFAULT_FACTORY_TIMEZONE)} · View / download</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
