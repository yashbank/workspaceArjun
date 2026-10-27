'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/mis/kit/button';
import { Input } from '@/components/mis/kit/input';
import { setLeavePayAction } from '@/app/(mis)/mis/settings/leave-pay/actions';
import { DEFAULT_FACTORY_TIMEZONE, formatFactoryDateTime } from '@/lib/mis/factory-time';
import type { LeavePayView } from '@/lib/mis/leave-pay';
import { dmy } from '@/lib/mis/rules-ledger';

/**
 * R2-102 — Settings > Leave pay. Owner only: the page's server read (`getLeavePaySettings`,
 * wages.read) refuses every other role before this renders, and the save is gated again on the server.
 * Shows no money — only which leave types count as paid days.
 */
export function LeavePayScreen({ view }: { view: LeavePayView }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const flip = (leaveType: string, label: string, paid: boolean) =>
    startTransition(async () => {
      setError(null);
      setSaved(null);
      const result = await setLeavePayAction({ leaveType, paid, reason: reason.trim() || undefined });
      if (!result.ok) {
        setError(result.detail);
        return;
      }
      setReason('');
      setSaved(`${label} is now ${paid ? 'paid' : 'unpaid'} from today.`);
    });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">🔒 Visible to you only</div>
      <h1 className="text-xl font-semibold text-slate-900">Leave pay</h1>
      <p className="text-sm text-slate-500">
        An approved leave of a <strong>Paid</strong> type counts as a paid day in payroll, at the same day value as a
        present day. An <strong>Unpaid</strong> type earns nothing. A change starts today and applies to the month it
        lands in onwards; a closed payroll month never changes.
      </p>
      <p className="text-sm text-slate-500">
        Until you change one, <strong>every type is Unpaid</strong> — the way payroll has always priced a leave day. Turn
        CL, SL and EL to <strong>Paid</strong> below if they should earn a day's wage. For a <strong>half-day leave</strong>, the worked half is always paid; <strong>Paid</strong> also pays the leave half (a full day), <strong>Unpaid</strong> deducts it (0.5 day).
      </p>

      {view.setupPending && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          The database update for this setting has not been run yet. The defaults below (every type Unpaid) are in use and cannot be changed
          until it is.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white px-4">
        {[...view.types, view.halfDay].map((t) => (
          <div key={t.leaveType} className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-800">{t.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">{t.isDefault ? 'Default' : `Since ${t.since ? dmy(t.since) : ''}`}</div>
            </div>
            <div role="group" aria-label={`${t.label}: paid or unpaid`} className="flex gap-2">
              <Button
                variant={t.paid ? 'primary' : 'secondary'}
                aria-pressed={t.paid}
                disabled={pending || view.setupPending || t.paid}
                onClick={() => flip(t.leaveType, t.label, true)}
              >
                Paid
              </Button>
              <Button
                variant={!t.paid ? 'primary' : 'secondary'}
                aria-pressed={!t.paid}
                disabled={pending || view.setupPending || !t.paid}
                onClick={() => flip(t.leaveType, t.label, false)}
              >
                Unpaid
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Input label="Reason for the change (optional)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-700">{saved}</p>}

      <h2 className="mt-2 text-base font-semibold text-slate-900">Change history</h2>
      <div className="rounded-xl border border-slate-200 bg-white px-4">
        {view.history.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">No changes yet — the defaults apply.</div>
        ) : (
          view.history.map((h) => (
            <div key={h.id} className="border-b border-slate-100 py-3 text-sm last:border-0">
              <div className="font-medium text-slate-800">
                {h.label} → {h.paid ? 'Paid' : 'Unpaid'} <span className="font-normal text-slate-500">from {dmy(h.effectiveFrom)}</span>
              </div>
              <div className="text-xs text-slate-500">
                {h.changedBy} · {formatFactoryDateTime(new Date(h.changedAt), DEFAULT_FACTORY_TIMEZONE)}
                {h.reason ? ` · ${h.reason}` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
