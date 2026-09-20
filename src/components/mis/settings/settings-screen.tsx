'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { Input } from '@/components/mis/kit/input';
import { updateRuleAction } from '@/app/(mis)/mis/settings/actions';

export type Rule = { id: string; ruleKey: string; ruleValue: string; valueType: string; label: string; description: string | null; effectiveFrom: Date };

export function RuleRow({ rule, canWrite, onSave }: { rule: Rule; canWrite: boolean; onSave?: (ruleKey: string, value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(rule.ruleValue);
  const [isPending, startTransition] = useTransition();

  const save = () => startTransition(async () => {
    await (onSave ?? updateRuleAction)(rule.ruleKey, val);
    setEditing(false);
  });

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-800 text-sm">{rule.label}</div>
        {rule.description && <div className="text-xs text-slate-500 mt-0.5">{rule.description}</div>}
        <div className="text-xs text-slate-400 font-mono mt-0.5">{rule.ruleKey}</div>
      </div>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Input label="" value={val} onChange={e => setVal(e.target.value)} />
            <Button onClick={save} disabled={isPending}>Save</Button>
            <Button variant="ghost" onClick={() => { setVal(rule.ruleValue); setEditing(false); }}>Cancel</Button>
          </>
        ) : (
          <>
            <span className="font-mono text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1">{rule.ruleValue}</span>
            {canWrite && <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}
          </>
        )}
      </div>
    </div>
  );
}

export function SettingsScreen({
  rules,
  canWrite,
  canSeeWages,
  canSeeAql,
  canManageKiosk,
}: {
  rules: Rule[];
  canWrite: boolean;
  canSeeWages: boolean;
  canSeeAql: boolean;
  canManageKiosk: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Business Rules</h1>
      <p className="text-sm text-slate-500">These settings govern attendance, salary and QC calculations. Every change is audited with an effective date.</p>

      {canSeeWages && (
        <Link
          href="/mis/settings/wages"
          className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 p-4 hover:bg-indigo-100"
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
              🔒 Visible to you only
            </div>
            <div className="mt-1 font-semibold text-slate-900">Wage types</div>
            <div className="text-sm text-slate-600">The code system that replaces the flat default rate.</div>
          </div>
          <span aria-hidden="true" className="text-indigo-600">→</span>
        </Link>
      )}

      {canSeeAql && (
        <Link
          href="/mis/settings/aql"
          className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 p-4 hover:bg-indigo-100"
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
              🔒 Visible to you only
            </div>
            <div className="mt-1 font-semibold text-slate-900">AQL thresholds</div>
            <div className="text-sm text-slate-600">Sample size and severity limits QC samples are scored against.</div>
          </div>
          <span aria-hidden="true" className="text-indigo-600">→</span>
        </Link>
      )}

      {/*
        Reachable by whoever gets past requireMisAccess()+settings.read (OWNER,
        ADMIN) — MIS-11's own rule ("ADMIN may view but not invite") is
        enforced one level down, inside /mis/settings/users itself, not here.
      */}
      <Link
        href="/mis/settings/users"
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
      >
        <div>
          <div className="font-semibold text-slate-900">MIS users</div>
          <div className="text-sm text-slate-600">Who has a MIS login, their role, and how many seats are used.</div>
        </div>
        <span aria-hidden="true" className="text-slate-400">→</span>
      </Link>

      {canManageKiosk && (
        <Link
          href="/mis/settings/devices"
          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
        >
          <div>
            <div className="font-semibold text-slate-900">Gate tablets</div>
            <div className="text-sm text-slate-600">Pair a new tablet, retire a lost one, and see how each is syncing.</div>
          </div>
          <span aria-hidden="true" className="text-slate-400">→</span>
        </Link>
      )}

      <div className="rounded-xl border border-slate-200 bg-white px-4">
        {rules.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No business rules configured.</div>
        ) : (
          rules.map(r => <RuleRow key={r.id} rule={r} canWrite={canWrite} />)
        )}
      </div>
    </div>
  );
}
