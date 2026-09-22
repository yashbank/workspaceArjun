'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { Card } from '@/components/mis/kit/card';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { clockInAction, clockOutAction, approveClockOutAction, editAttendanceAction, markAbsentBulkAction } from '@/app/(mis)/mis/attendance/actions';
import Link from 'next/link';

type AttendanceRec = {
  id: string; date: Date; status: string; clockIn: Date | null; clockOut: Date | null;
  approvedOut: boolean; lateMinutes: number; otMinutes: number; notes: string | null;
  employee: { id: string; name: string; employeeCode: string; role: string } | null;
  shift: { name: string; startTime: string; endTime: string } | null;
};
type SummaryRec = { employee: { id: string; name: string; employeeCode: string } | null; present: number; absent: number; otMinutes: number; lateMinutes: number };

type Props = {
  records: AttendanceRec[]; summary: SummaryRec[]; shifts: any[];
  canWrite: boolean; view: string; year: number; month: number; date?: string;
};

const STATUS_TONE: Record<string, 'good' | 'warning' | 'critical' | 'neutral'> = {
  PRESENT: 'good', HALF_DAY: 'warning', ABSENT: 'critical', LEAVE: 'neutral', HOLIDAY: 'neutral',
};

function fmtTime(d: Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtMin(m: number) { return m > 0 ? `${m}m` : '—'; }

export function AttendanceScreen({ records, summary, shifts, canWrite, view, year, month, date }: Props) {
  const [empSearch, setEmpSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelected = (employeeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const markSelectedAbsent = () => startTransition(async () => {
    await markAbsentBulkAction([...selected], date);
    setSelected(new Set());
  });
  const filteredRecords = empSearch.trim()
    ? records.filter(r => (r.employee?.name ?? '').toLowerCase().includes(empSearch.toLowerCase()) || (r.employee?.employeeCode ?? '').toLowerCase().includes(empSearch.toLowerCase()))
    : records;
  const filteredSummary = empSearch.trim()
    ? summary.filter(r => (r.employee?.name ?? '').toLowerCase().includes(empSearch.toLowerCase()) || (r.employee?.employeeCode ?? '').toLowerCase().includes(empSearch.toLowerCase()))
    : summary;

  const [editOpen, setEditOpen] = useState(false);
  const [editRec, setEditRec] = useState<AttendanceRec | null>(null);
  const [editStatus, setEditStatus] = useState('PRESENT');
  const [editNotes, setEditNotes] = useState('');

  const openEdit = (r: AttendanceRec) => { setEditRec(r); setEditStatus(r.status); setEditNotes(r.notes ?? ''); setEditOpen(true); };

  const dailyCols: Column<AttendanceRec>[] = [
    ...(canWrite ? [{
      key: 'select', header: '', render: (r: AttendanceRec) => r.employee ? (
        <input
          type="checkbox"
          checked={selected.has(r.employee.id)}
          onChange={() => toggleSelected(r.employee!.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-slate-300"
        />
      ) : null,
    } as Column<AttendanceRec>] : []),
    { key: 'emp', header: 'Employee', render: (r) => <div><div className="font-medium">{r.employee?.name ?? '—'}</div><div className="text-xs text-slate-500">{r.employee?.employeeCode}</div></div> },
    { key: 'shift', header: 'Shift', render: (r) => <span>{r.shift ? `${r.shift.name} (${r.shift.startTime}–${r.shift.endTime})` : '—'}</span> },
    { key: 'in', header: 'Clock In', render: (r) => <span>{fmtTime(r.clockIn)}</span> },
    { key: 'out', header: 'Clock Out', render: (r) => <span>{fmtTime(r.clockOut)}{r.approvedOut ? <span className="ml-1 text-xs text-green-600">✓</span> : null}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status.replace(/_/g, ' ')}</StatusBadge> },
    { key: 'late', header: 'Late', render: (r) => <span>{fmtMin(r.lateMinutes)}</span> },
    { key: 'ot', header: 'OT', render: (r) => <span>{fmtMin(r.otMinutes)}</span> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 justify-end">
        {canWrite && !r.clockIn && <Button variant="ghost" onClick={() => startTransition(async () => { await clockInAction(r.employee!.id); })}>Clock In</Button>}
        {canWrite && r.clockIn && !r.clockOut && <Button variant="ghost" onClick={() => startTransition(async () => { await clockOutAction(r.id); })}>Clock Out</Button>}
        {canWrite && r.clockOut && !r.approvedOut && <Button variant="ghost" onClick={() => startTransition(async () => { await approveClockOutAction(r.id); })}>Approve Out</Button>}
        {canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
      </div>
    )},
  ];

  const monthCols: Column<SummaryRec>[] = [
    { key: 'emp', header: 'Employee', render: (r) => <div><div className="font-medium">{r.employee?.name ?? '—'}</div><div className="text-xs text-slate-500">{r.employee?.employeeCode}</div></div> },
    { key: 'present', header: 'Present', render: (r) => <span className="font-mono">{r.present}</span> },
    { key: 'absent', header: 'Absent', render: (r) => <span className="font-mono">{r.absent}</span> },
    { key: 'ot', header: 'OT (min)', render: (r) => <span className="font-mono">{r.otMinutes}</span> },
    { key: 'late', header: 'Late (min)', render: (r) => <span className="font-mono">{r.lateMinutes}</span> },
  ];

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Attendance</h1>
        <div className="flex gap-2">
          <Link href="/mis/attendance?view=daily" className={`inline-flex min-h-11 items-center rounded-lg px-3 text-base font-medium ${view === 'daily' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Daily</Link>
          <Link href="/mis/attendance?view=monthly" className={`inline-flex min-h-11 items-center rounded-lg px-3 text-base font-medium ${view === 'monthly' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Monthly ({month}/{year})</Link>
        </div>
      </div>

      <div>
        <input type="search" placeholder="Search employee…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>

      {view === 'daily' ? (
        <>
          {canWrite && selected.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
              <span className="text-sm text-amber-800">{selected.size} employee{selected.size === 1 ? '' : 's'} selected</span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                <Button onClick={markSelectedAbsent} disabled={isPending}>{isPending ? 'Marking…' : 'Mark Absent'}</Button>
              </div>
            </div>
          )}
          <DataTable columns={dailyCols} rows={filteredRecords} rowKey={(r) => r.id} emptyTitle="No attendance records" emptyBody="Records appear once employees clock in." />
        </>
      ) : (
        <DataTable columns={monthCols} rows={filteredSummary} rowKey={(r: any) => r.employee?.id ?? Math.random().toString()} emptyTitle="No data for this month" />
      )}

      <SlideOver open={editOpen} onClose={() => setEditOpen(false)} title="Edit Attendance">
        <div className="flex flex-col gap-4 p-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Status</label>
            <select className="mt-1 w-full min-h-12 rounded border border-slate-300 bg-white px-3 text-base text-slate-900" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
              {['PRESENT','ABSENT','HALF_DAY','LEAVE','HOLIDAY'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Input label="Notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={() => startTransition(async () => { if (editRec) { await editAttendanceAction(editRec.id, { status: editStatus, notes: editNotes }); setEditOpen(false); } })} disabled={isPending}>Save</Button>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
