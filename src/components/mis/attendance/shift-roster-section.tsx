'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DateInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { assignRosterAction, removeRosterAction } from '@/app/(mis)/mis/attendance/actions';
import { resolveShiftForDate } from '@/lib/mis/shift-roster';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';

type ShiftLite = { id: string; name: string; isActive: boolean };
type Person = { id: string; name: string; employeeCode: string; defaultShiftId: string | null };
type Row = { id: string; employeeId: string; shiftId: string; startDate: string; endDate: string };

interface Props {
  shifts: ShiftLite[];
  employees: Person[];
  rows: Row[];
  days: string[];
  prevFrom: string;
  nextFrom: string;
  canWrite: boolean;
}

const dayLabel = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function ShiftRosterSection({ shifts, employees, rows, days, prevFrom, nextFrom, canWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [from, setFrom] = useState(days[0]);
  const [to, setTo] = useState(days[days.length - 1]);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const shiftName = (id: string | null) => shifts.find((s) => s.id === id)?.name ?? '—';
  const activeShifts = shifts.filter((s) => s.isActive);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = () => startTransition(async () => {
    const res = await assignRosterAction({ employeeIds: picked, shiftId, startDate: from, endDate: to });
    if (!res.ok) { toast('error', res.detail); return; }
    setOpen(false); setPicked([]);
  });

  const removeEntry = async (row: Row) => {
    const ok = await confirm({ title: 'Remove roster entry?', message: `${shiftName(row.shiftId)}, ${row.startDate} to ${row.endDate}.`, confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    startTransition(async () => {
      const res = await removeRosterAction(row.id);
      if (!res.ok) toast('error', res.detail);
    });
  };

  return (
    <section className="space-y-3" aria-labelledby="roster-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="roster-heading" className="text-lg font-semibold text-slate-900">Roster</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`?from=${prevFrom}`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700">Previous week</Link>
          <Link href={`?from=${nextFrom}`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700">Next week</Link>
          {canWrite && <Button onClick={() => setOpen(true)} disabled={activeShifts.length === 0}>Assign shift</Button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Employee</th>
              {days.map((d) => <th key={d} className="px-2 py-3 font-medium whitespace-nowrap">{dayLabel(d)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.length === 0 && <tr><td colSpan={days.length + 1} className="py-6 text-center text-slate-400">No active employees.</td></tr>}
            {employees.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 whitespace-nowrap text-slate-900">{e.name} <span className="text-xs text-slate-400">{e.employeeCode}</span></td>
                {days.map((d) => {
                  const mine = rows.filter((r) => r.employeeId === e.id);
                  const sid = resolveShiftForDate(e, d, mine);
                  const entry = mine.find((r) => r.shiftId === sid && r.startDate <= d && d <= r.endDate);
                  const pill = entry ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500';
                  return (
                    <td key={d} className="px-2 py-2">
                      {sid ? (
                        canWrite && entry ? (
                          <button type="button" onClick={() => removeEntry(entry)} disabled={isPending} aria-label={`Remove ${shiftName(sid)} for ${e.name}`} className={`min-h-11 rounded-full px-3 text-xs font-medium ${pill}`}>{shiftName(sid)}</button>
                        ) : (
                          <span className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium ${pill}`}>{shiftName(sid)}</span>
                        )
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Blue is a roster entry; grey is the employee&apos;s default shift.{canWrite ? ' Tap a blue pill to remove that entry.' : ''}</p>

      <SlideOver open={open} onClose={() => setOpen(false)} title="Assign shift">
        <div className="flex flex-col gap-4 p-4">
          <Select label="Shift" value={shiftId || null} options={activeShifts.map((s) => ({ value: s.id, label: s.name }))} onChange={setShiftId} />
          <DateInput label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
          <DateInput label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <fieldset className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            <legend className="px-1 text-sm font-medium text-slate-700">Employees ({picked.length})</legend>
            {employees.map((e) => (
              <label key={e.id} className="flex min-h-11 items-center gap-3 px-3 text-base text-slate-900">
                <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4" />
                {e.name} <span className="text-xs text-slate-400">{e.employeeCode}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={isPending || !shiftId || picked.length === 0 || !from || !to}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
      {confirmDialog}
    </section>
  );
}
