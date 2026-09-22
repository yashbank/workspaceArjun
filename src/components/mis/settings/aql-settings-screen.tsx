'use client';
import Link from 'next/link';
import { RuleRow, type Rule } from '@/components/mis/settings/settings-screen';
import { updateAqlThresholdAction } from '@/app/(mis)/mis/settings/aql/actions';

/**
 * The AQL threshold screen — Owner-only (aql.read), reached only from the
 * link `SettingsScreen` renders when `canSeeAql` is true. Reuses `RuleRow`
 * from the general settings screen rather than a second row component; the
 * only thing different here is which rules are on the page and who wrote
 * them (`updateAqlThresholdAction`, not `updateRuleAction`).
 */
export function AqlSettingsScreen({ rules }: { rules: Rule[] }) {
  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-4">
      <Link href="/mis/settings" className="inline-flex min-h-11 w-fit items-center text-base text-slate-500 hover:text-slate-700">
        ← Settings
      </Link>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
        🔒 Visible to you only
      </div>
      <h1 className="text-xl font-semibold text-slate-900">AQL thresholds</h1>
      <p className="text-sm text-slate-500">
        A QC sample is rejected the moment any one of these limits is exceeded. Changing a
        limit here only affects samples scored from this moment on — a sample already
        decided keeps the thresholds it was scored under.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white px-4">
        {rules.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No AQL thresholds configured.</div>
        ) : (
          rules.map((r) => (
            <RuleRow key={r.id} rule={r} canWrite onSave={updateAqlThresholdAction} />
          ))
        )}
      </div>
    </div>
  );
}
