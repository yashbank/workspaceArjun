'use client';
import { ListPager, usePagedRows } from './list-pager';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { DateInput, Input, TimeInput } from '@/components/mis/kit/input';
import { clockInAction, clockOutAction, approveClockOutAction, editAttendanceAction, markAbsentBulkAction, bulkPunchAction, listPunchesForDayAction, addAttendanceNoteAction } from '@/app/(mis)/mis/attendance/actions';
import { useToast } from '@/components/ui/toast';
import { addDaysToDateKey, formatFactoryTime, zonedParts } from '@/lib/mis/factory-time';
import type { ActionResult } from '@/lib/mis/action-result';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type AttendanceRec = {
  id: string; date: Date; status: string; clockIn: Date | null; clockOut: Date | null;
  approvedOut: boolean; lateMinutes: number; otMinutes: number; notes: string | null;
  employee: { id: string; name: string; employeeCode: string; role: string } | null;
  shift: { name: string; startTime: string; endTime: string } | null;
};
type PunchRow = {
  id: string; direction: 'IN' | 'OUT'; punchedAt: Date;
  deviceName: string | null; fromRevokedDevice: boolean; operatorName: string | null;
};
type SummaryRec = { employee: { id: string; name: string; employeeCode: string } | null; present: number; absent: number; otMinutes: number; lateMinutes: number };

type Unrecorded = { id: string; name: string; employeeCode: string; role: string };

type Props = {
  records: AttendanceRec[]; unrecorded?: Unrecorded[]; todayKey?: string; summary: SummaryRec[]; shifts: { id: string; name: string }[];
  canWrite: boolean; canNote?: boolean; view: string; monthKey: string; date?: string; timeZone: string;
};

const STATUS_TONE: Record<string, 'good' | 'warning' | 'critical' | 'neutral'> = {
  NOT_RECORDED: 'warning', PRESENT: 'good', HALF_DAY: 'warning', ABSENT: 'critical', LEAVE: 'neutral', HOLIDAY: 'neutral',
};

function fmtTime(d: Date | null, timeZone: string) {
  if (!d) return '—';
  return formatFactoryTime(new Date(d), timeZone);
}

/** "HH:MM" on the factory clock, for a <input type=time>. */
function toTimeInput(d: Date | null, timeZone: string) {
  if (!d) return '';
  const p = zonedParts(new Date(d), timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function fmtMin(m: number) { return m > 0 ? `${m}m` : '—'; }

export function AttendanceScreen({ records, unrecorded = [], todayKey, summary, shifts: _shifts, canWrite, canNote = false, view, monthKey, date, timeZone }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  /** B63: show a refusal as a toast; true when the action went through. */
  const settle = (result: ActionResult<unknown>) => {
    if (!result.ok) toast('error', result.detail);
    return result.ok;
  };
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
    const res = await markAbsentBulkAction([...selected], date);
    if (settle(res) && res.ok && res.value.skipped.length > 0) {
      toast('info', `${res.value.skipped.length} skipped (already punched, on leave or edited)`);
    }
    setSelected(new Set());
  });
  // R2-165/166: one dialog for every manual punch - the toolbar's bulk clock-in/out and a past-day row's Clock In.
  const [punchOpen, setPunchOpen] = useState(false);
  const [punchKind, setPunchKind] = useState<'IN' | 'OUT'>('IN');
  const [punchIds, setPunchIds] = useState<string[]>([]);
  const [punchTime, setPunchTime] = useState('');
  const [mountedAt] = useState(() => Date.now()); // fallback date, read once (render must stay pure)
  const openPunch = (kind: 'IN' | 'OUT', ids: string[]) => { setPunchKind(kind); setPunchIds(ids); setPunchTime(''); setPunchOpen(true); };
  const submitPunch = () => startTransition(async () => {
    const res = await bulkPunchAction(punchKind, punchIds, { date, time: punchTime || null });
    if (!settle(res)) return;
    if (res.ok && res.value.skipped.length > 0) toast('info', `${res.value.skipped.length} skipped: ${[...new Set(res.value.skipped.map((s) => s.reason))].join(', ')}`);
    setPunchOpen(false);
    setSelected(new Set());
  });
  // R2-94/95: people with no register row yet (nobody punched them) are shown too, so the operator can clock them in or mark them absent.
  const allRecords: AttendanceRec[] = [
    ...records,
    ...unrecorded.map((e): AttendanceRec => ({
      id: `new:${e.id}`, date: new Date(date ?? todayKey ?? mountedAt), status: 'NOT_RECORDED', clockIn: null, clockOut: null,
      approvedOut: false, lateMinutes: 0, otMinutes: 0, notes: null, employee: e, shift: null,
    })),
  ];
  const isToday = !date || !todayKey || date === todayKey;
  const filteredRecords = empSearch.trim()
    ? allRecords.filter(r => (r.employee?.name ?? '').toLowerCase().includes(empSearch.toLowerCase()) || (r.employee?.employeeCode ?? '').toLowerCase().includes(empSearch.toLowerCase()))
    : allRecords;
  const filteredSummary = empSearch.trim()
    ? summary.filter(r => (r.employee?.name ?? '').toLowerCase().includes(empSearch.toLowerCase()) || (r.employee?.employeeCode ?? '').toLowerCase().includes(empSearch.toLowerCase()))
    : summary;

  const dailyPaged = usePagedRows(filteredRecords, `${empSearch}|${date ?? ''}`);
  const [editOpen, setEditOpen] = useState(false);
  const [editRec, setEditRec] = useState<AttendanceRec | null>(null);
  const [editStatus, setEditStatus] = useState('PRESENT');
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteRec, setNoteRec] = useState<AttendanceRec | null>(null);
  const [noteText, setNoteText] = useState('');

  const openEdit = (r: AttendanceRec) => { setEditRec(r); setEditStatus(r.status); setEditNotes(r.notes ?? ''); setEditReason(''); setEditIn(toTimeInput(r.clockIn, timeZone)); setEditOut(toTimeInput(r.clockOut, timeZone)); setEditOpen(true); };
  const openNote = (r: AttendanceRec) => { setNoteRec(r); setNoteText(''); setNoteOpen(true); };

  const [punchesOpen, setPunchesOpen] = useState(false);
  const [punchesRec, setPunchesRec] = useState<AttendanceRec | null>(null);
  const [punches, setPunches] = useState<PunchRow[] | null>(null);

  const openPunches = async (r: AttendanceRec) => {
    if (!r.employee) return;
    setPunchesRec(r);
    setPunches(null);
    setPunchesOpen(true);
    const dateKey = new Date(r.date).toISOString().slice(0, 10);
    const res = await listPunchesForDayAction(r.employee.id, dateKey);
    if (settle(res) && res.ok) setPunches(res.value);
    else setPunchesOpen(false);
  };

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
    { key: 'in', header: 'Clock In', render: (r) => <span>{fmtTime(r.clockIn, timeZone)}</span> },
    { key: 'out', header: 'Clock Out', render: (r) => <span>{fmtTime(r.clockOut, timeZone)}{r.approvedOut ? <span className="ml-1 text-xs text-green-600">✓</span> : null}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status.replace(/_/g, ' ')}</StatusBadge> },
    { key: 'late', header: 'Late', render: (r) => <span>{fmtMin(r.lateMinutes)}</span> },
    { key: 'ot', header: 'OT', render: (r) => <span>{fmtMin(r.otMinutes)}</span> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 justify-end">
        {canWrite && !r.clockIn && isToday && <Button variant="ghost" onClick={() => startTransition(async () => { settle(await clockInAction(r.employee!.id)); })}>Clock In</Button>}
        {canWrite && !r.clockIn && !isToday && r.employee && <Button variant="ghost" onClick={() => openPunch('IN', [r.employee!.id])}>Clock In</Button>}
        {canWrite && r.clockIn && !r.clockOut && <Button variant="ghost" onClick={() => startTransition(async () => { settle(await clockOutAction(r.id)); })}>Clock Out</Button>}
        {canWrite && r.clockOut && !r.approvedOut && <Button variant="ghost" onClick={() => startTransition(async () => { settle(await approveClockOutAction(r.id)); })}>Approve Out</Button>}
        {(r.clockIn || r.clockOut) && <Button variant="ghost" onClick={() => openPunches(r)}>Punches</Button>}
        {canWrite && !r.id.startsWith('new:') && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {canNote && !canWrite && <Button variant="ghost" onClick={() => openNote(r)}>Add note</Button>}
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
          <Link href="/mis/attendance?view=monthly" className={`inline-flex min-h-11 items-center rounded-lg px-3 text-base font-medium ${view === 'monthly' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Monthly ({monthKey})</Link>
          <Link href="/mis/attendance/leave" className="inline-flex min-h-11 items-center rounded-lg bg-slate-100 px-3 text-base font-medium text-slate-700 hover:bg-slate-200">Leave requests</Link>
          {canWrite && <Link href="/mis/attendance/shifts" className="inline-flex min-h-11 items-center rounded-lg bg-slate-100 px-3 text-base font-medium text-slate-700 hover:bg-slate-200">Shifts</Link>}
          {/* D28 — the same door (attendance.write) that already gates clock-in/out edits on this screen. */}
          {canWrite && (
            <Link href="/mis/attendance/extra-pay" className="inline-flex min-h-11 items-center rounded-lg bg-indigo-50 px-3 text-base font-medium text-indigo-700 hover:bg-indigo-100">
              + Extra pay day
            </Link>
          )}
        </div>
      </div>

      {view === 'daily' && (
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="ghost" onClick={() => date && router.push(`/mis/attendance?view=daily&date=${addDaysToDateKey(date, -1)}`)} disabled={!date}>← Previous day</Button>
          <DateInput
            label="Date"
            value={date ?? ''}
            max={todayKey}
            onChange={(e) => { if (e.target.value) router.push(`/mis/attendance?view=daily&date=${e.target.value}`); }}
          />
          <Button variant="ghost" onClick={() => date && router.push(`/mis/attendance?view=daily&date=${addDaysToDateKey(date, 1)}`)} disabled={!date || !!(todayKey && date >= todayKey)}>Next day →</Button>
          {!isToday && todayKey && <Button variant="ghost" onClick={() => router.push('/mis/attendance?view=daily')}>Today</Button>}
        </div>
      )}

      {view === 'monthly' && (
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Month
          <input
            type="month"
            value={monthKey}
            onChange={(e) => { if (e.target.value) router.push(`/mis/attendance?view=monthly&month=${e.target.value}`); }}
            className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900"
          />
        </label>
      )}

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
                <Button variant="secondary" onClick={() => openPunch('IN', [...selected])} disabled={isPending}>Bulk Clock In</Button>
                <Button variant="secondary" onClick={() => openPunch('OUT', [...selected])} disabled={isPending}>Bulk Clock Out</Button>
                <Button onClick={markSelectedAbsent} disabled={isPending}>{isPending ? 'Marking…' : 'Mark Absent'}</Button>
              </div>
            </div>
          )}
          <DataTable columns={dailyCols} rows={dailyPaged.pageRows} rowKey={(r) => r.id} emptyTitle="No attendance records" emptyBody="No active employees on the roll for this day." />
          <ListPager page={dailyPaged.page} total={dailyPaged.total} setPage={dailyPaged.setPage} />
        </>
      ) : (
        <DataTable columns={monthCols} rows={filteredSummary} rowKey={(r) => r.employee?.id ?? Math.random().toString()} emptyTitle="No data for this month" />
      )}

      <SlideOver open={editOpen} onClose={() => setEditOpen(false)} title="Edit Attendance">
        <div className="flex flex-col gap-4 p-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Status</label>
            <select className="mt-1 w-full min-h-12 rounded border border-slate-300 bg-white px-3 text-base text-slate-900" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
              {['PRESENT','ABSENT','HALF_DAY','LEAVE','HOLIDAY'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TimeInput label="Clock In" value={editIn} onChange={e => setEditIn(e.target.value)} />
            <TimeInput label="Clock Out" value={editOut} onChange={e => setEditOut(e.target.value)} />
          </div>
          <Input label="Notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
          <Input label="Reason (only for a closed month; Owner)" value={editReason} onChange={e => setEditReason(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={() => startTransition(async () => { if (editRec) { const override = editReason.trim().length >= 3 ? { reason: editReason.trim() } : undefined; if (settle(await editAttendanceAction(editRec.id, { status: editStatus, notes: editNotes, clockInTime: editIn && editIn !== toTimeInput(editRec.clockIn, timeZone) ? editIn : undefined, clockOutTime: editOut && editOut !== toTimeInput(editRec.clockOut, timeZone) ? editOut : undefined }, override))) setEditOpen(false); } })} disabled={isPending}>Save</Button>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={punchOpen} onClose={() => setPunchOpen(false)} title={punchKind === 'IN' ? 'Clock In' : 'Clock Out'}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">{punchIds.length} employee{punchIds.length === 1 ? '' : 's'} · {date ?? todayKey}</p>
          <TimeInput label={isToday ? 'Time (leave blank for now)' : 'Time (required for a past day)'} value={punchTime} onChange={(e) => setPunchTime(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={submitPunch} disabled={isPending || (!isToday && !punchTime)}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setPunchOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={noteOpen} onClose={() => setNoteOpen(false)} title={noteRec?.employee ? `Add note — ${noteRec.employee.name}` : 'Add note'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Note (up to 500 characters)" value={noteText} onChange={e => setNoteText(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={() => startTransition(async () => { if (noteRec && settle(await addAttendanceNoteAction(noteRec.id, noteText))) setNoteOpen(false); })} disabled={isPending || !noteText.trim()}>Save note</Button>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={punchesOpen} onClose={() => setPunchesOpen(false)} title={punchesRec?.employee ? `Punches — ${punchesRec.employee.name}` : 'Punches'}>
        <div className="flex flex-col gap-2 p-4">
          {punches === null && <p className="text-sm text-slate-500">Loading…</p>}
          {punches !== null && punches.length === 0 && <p className="text-sm text-slate-500">No punches recorded for this day.</p>}
          {punches !== null && punches.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {punches.map((p) => (
                <li key={p.id} className="py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{p.direction === 'IN' ? 'Clock In' : 'Clock Out'}</span>
                    <span className="font-mono text-sm text-slate-500">{fmtTime(p.punchedAt, timeZone)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {p.deviceName ?? 'Portal'}
                    {p.operatorName && ` · Operator: ${p.operatorName}`}
                    {p.fromRevokedDevice && ' · retired device'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
