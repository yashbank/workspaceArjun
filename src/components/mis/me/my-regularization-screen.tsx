'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { submitPunchRegularizationAction, withdrawPunchRegularizationAction } from '@/app/(mis)/mis/attendance/regularization-actions';
import { Button } from '@/components/mis/kit/button';
import { DateInput, Input, TimeInput } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { useToast } from '@/components/ui/toast';
import { formatFactoryDate, formatFactoryTime } from '@/lib/mis/factory-time';
import { REGULARIZATION_REASON_MAX, validateRegularization } from '@/lib/mis/punch-regularization';

/** R2-222 - plain shape: ISO instants as strings, day keys, no Date. */
export type MyRegularizationRow = {
  id: string; workDate: string; requestedIn: string | null; requestedOut: string | null;
  reason: string; status: string; decisionNote: string | null;
};

const TONE: Record<string, 'good' | 'warning' | 'critical' | 'neutral'> = { APPROVED: 'good', PENDING: 'warning', REJECTED: 'critical' };

export function MyRegularizationScreen({ employeeId, todayKey, timeZone, rows }: { employeeId: string; todayKey: string; timeZone: string; rows: MyRegularizationRow[] }) {
  const [workDate, setWorkDate] = useState('');
  const [requestedIn, setIn] = useState('');
  const [requestedOut, setOut] = useState('');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const check = workDate ? validateRegularization({ workDate, requestedIn, requestedOut, reason }, todayKey) : null;
  const problem = check && !check.ok ? check.error : null;

  const time = (iso: string | null) => (iso ? formatFactoryTime(new Date(iso), timeZone) : '—');
  const day = (key: string) => formatFactoryDate(new Date(`${key}T00:00:00Z`), 'UTC');

  const submit = () =>
    startTransition(async () => {
      const res = await submitPunchRegularizationAction({ employeeId, workDate, requestedIn: requestedIn || null, requestedOut: requestedOut || null, reason });
      if (!res.ok) { toast('error', res.detail); return; }
      setWorkDate(''); setIn(''); setOut(''); setReason('');
      router.refresh();
    });

  const withdraw = (id: string) =>
    startTransition(async () => {
      const res = await withdrawPunchRegularizationAction(id);
      if (!res.ok) toast('error', res.detail);
      else router.refresh();
    });

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24 md:max-w-3xl">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">Missed punch</h1>
        <p className="mt-1 text-sm text-slate-500">Forgot to punch in or out? Ask your supervisor to fix the day.</p>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <DateInput label="Day" value={workDate} max={todayKey} onChange={(e) => setWorkDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TimeInput label="Clock-in" value={requestedIn} onChange={(e) => setIn(e.target.value)} />
          <TimeInput label="Clock-out" value={requestedOut} onChange={(e) => setOut(e.target.value)} />
        </div>
        <Input label="Reason" value={reason} maxLength={REGULARIZATION_REASON_MAX} onChange={(e) => setReason(e.target.value)} />
        {problem && reason.length > 0 && <p role="alert" className="text-sm text-red-600">{problem}</p>}
        <Button onClick={submit} disabled={isPending || !check || !check.ok}>Send request</Button>
      </section>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No requests yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{day(r.workDate)}</div>
                <div className="text-xs text-slate-500">In {time(r.requestedIn)} · Out {time(r.requestedOut)} · {r.reason}</div>
                {r.decisionNote && <div className="text-xs text-slate-500">Note: {r.decisionNote}</div>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={TONE[r.status] ?? 'neutral'}>{r.status}</StatusBadge>
                {r.status === 'PENDING' && <Button variant="ghost" onClick={() => withdraw(r.id)} disabled={isPending}>Withdraw</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
