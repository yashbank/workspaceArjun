'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { decidePunchRegularizationAction } from '@/app/(mis)/mis/attendance/regularization-actions';
import { Button } from '@/components/mis/kit/button';
import { Input } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { useToast } from '@/components/ui/toast';
import { formatFactoryDate, formatFactoryTime } from '@/lib/mis/factory-time';
import { REGULARIZATION_NOTE_MIN } from '@/lib/mis/punch-regularization';

/** R2-222 - plain shape for the review queue. */
export type RegularizationReviewRow = {
  id: string; workDate: string; requestedIn: string | null; requestedOut: string | null; reason: string;
  employee: { name: string; employeeCode: string };
};

export function RegularizationReviewScreen({ rows, timeZone }: { rows: RegularizationReviewRow[]; timeZone: string }) {
  const [rejectFor, setRejectFor] = useState<RegularizationReviewRow | null>(null);
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const time = (iso: string | null) => (iso ? formatFactoryTime(new Date(iso), timeZone) : '—');
  const day = (key: string) => formatFactoryDate(new Date(`${key}T00:00:00Z`), 'UTC');

  const decide = (id: string, approve: boolean, why?: string) =>
    startTransition(async () => {
      const res = await decidePunchRegularizationAction(id, approve, why);
      if (!res.ok) { toast('error', res.detail); return; }
      setRejectFor(null); setNote('');
      router.refresh();
    });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pb-24">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">Regularization requests</h1>
        <p className="mt-1 text-sm text-slate-500">Missed-punch requests waiting for review. Approving fixes the attendance row.</p>
      </section>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Nothing waiting.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{r.employee.name} <span className="font-mono text-xs text-slate-500">{r.employee.employeeCode}</span></div>
                <div className="text-sm text-slate-700">{day(r.workDate)} · In {time(r.requestedIn)} · Out {time(r.requestedOut)}</div>
                <div className="text-xs text-slate-500">{r.reason}</div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => decide(r.id, true)} disabled={isPending}>Approve</Button>
                <Button variant="ghost" onClick={() => setRejectFor(r)} disabled={isPending}>Reject</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SlideOver open={!!rejectFor} onClose={() => setRejectFor(null)} title="Reject request">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">{rejectFor?.employee.name} · {rejectFor ? day(rejectFor.workDate) : ''}</p>
          <Input label="Reason for rejecting" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={() => rejectFor && decide(rejectFor.id, false, note)} disabled={isPending || note.trim().length < REGULARIZATION_NOTE_MIN}>Reject</Button>
            <Button variant="ghost" onClick={() => setRejectFor(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
