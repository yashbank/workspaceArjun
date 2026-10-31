'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cancelLeaveRequestAction, requestLeaveAction } from '@/app/(mis)/mis/attendance/actions';
import { Button } from '@/components/mis/kit/button';
import { DateInput, Input } from '@/components/mis/kit/input';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { useToast } from '@/components/ui/toast';
import { formatFactoryDate } from '@/lib/mis/factory-time';
import { HALF_DAY_LEAVE, LEAVE_TYPES, LEAVE_TYPE_LABEL, leaveTypeLabel, validateLeaveRange } from '@/lib/mis/leave';

/** R2-220 — a plain shape: ISO strings, no Date, no employee (these are all my own). */
export type MyLeaveRow = { id: string; date: string; endDate: string | null; leaveType: string; status: string; reason: string | null };

const TONE: Record<string, 'good' | 'warning' | 'critical' | 'neutral'> = {
  APPROVED: 'good',
  PENDING: 'warning',
  REJECTED: 'critical',
  CANCELLED: 'neutral',
};

const TYPE_OPTIONS: SelectOption[] = [
  ...LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABEL[t] })),
  { value: HALF_DAY_LEAVE, label: leaveTypeLabel(HALF_DAY_LEAVE) },
];

const day = (iso: string) => formatFactoryDate(new Date(iso), 'UTC');

export function MyLeaveScreen({ employeeId, leaves }: { employeeId: string; leaves: MyLeaveRow[] }) {
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState('CL');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const isHalfDay = leaveType === HALF_DAY_LEAVE;
  const rangeError = date && !isHalfDay ? validateLeaveRange(date, endDate || null) : null;

  const apply = () =>
    startTransition(async () => {
      const res = await requestLeaveAction(employeeId, date, reason || undefined, {
        endDate: isHalfDay ? null : endDate || null,
        leaveType,
      });
      if (!res.ok) { toast('error', res.detail); return; }
      setDate(''); setEndDate(''); setReason(''); setLeaveType('CL'); setOpen(false);
      router.refresh();
    });

  const withdraw = (id: string) =>
    startTransition(async () => {
      const res = await cancelLeaveRequestAction(id);
      if (!res.ok) toast('error', res.detail);
      else router.refresh();
    });

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24 md:max-w-3xl">
      <section className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">My leave</h1>
        <Button onClick={() => setOpen(true)}>Apply for leave</Button>
      </section>

      {leaves.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No leave requests yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {leaves.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">
                  {day(l.date)}{l.endDate ? ` – ${day(l.endDate)}` : ''}
                </div>
                <div className="text-xs text-slate-500">{leaveTypeLabel(l.leaveType)}{l.reason ? ` · ${l.reason}` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={TONE[l.status] ?? 'neutral'}>{l.status}</StatusBadge>
                {l.status === 'PENDING' && (
                  <Button variant="ghost" onClick={() => withdraw(l.id)} disabled={isPending}>Withdraw</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <SlideOver open={open} onClose={() => setOpen(false)} title="Apply for leave">
        <div className="flex flex-col gap-4 p-4">
          <Select label="Leave type" value={leaveType} options={TYPE_OPTIONS} onChange={setLeaveType} />
          <DateInput label="From" value={date} onChange={(e) => setDate(e.target.value)} />
          {!isHalfDay && <DateInput label="To (leave blank for a single day)" value={endDate} onChange={(e) => setEndDate(e.target.value)} />}
          {rangeError && <p role="alert" className="text-sm text-red-600">{rangeError}</p>}
          <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={apply} disabled={isPending || !date || !!rangeError}>Submit</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
