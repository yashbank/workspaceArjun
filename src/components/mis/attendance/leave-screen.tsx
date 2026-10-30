'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { Combobox } from '@/components/ui/combobox';
import { Input, DateInput } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { ListPager, usePagedRows } from './list-pager';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { requestLeaveAction, approveLeaveAction, cancelLeaveRequestAction } from '@/app/(mis)/mis/attendance/actions';
import { useToast } from '@/components/ui/toast';
import { formatFactoryDate } from '@/lib/mis/factory-time';
import { HALF_DAY_LEAVE, LEAVE_TYPES, LEAVE_TYPE_LABEL, countLeaveWorkingDays, leaveTypeLabel, validateLeaveRange } from '@/lib/mis/leave';

type Employee = { id: string; name: string; employeeCode: string };
type LeaveRow = {
  id: string;
  date: Date | string;
  /** R2-101: last day, inclusive; null for a single-day leave. */
  endDate?: Date | string | null;
  /** R2-102 */
  leaveType?: string;
  status: string;
  reason: string | null;
  employee: Employee | null;
  /** R2-225: server's verdict on whether THIS viewer may decide this row; absent falls back to the role props. */
  canDecide?: boolean;
};

const STATUS_TONE: Record<string, 'good' | 'warning' | 'critical' | 'neutral'> = {
  APPROVED: 'good',
  PENDING: 'warning',
  REJECTED: 'critical',
  CANCELLED: 'neutral',
};

interface Props {
  leaves: LeaveRow[];
  employees: Employee[];
  canApprove: boolean;
  /** R2-167: Owner or Admin — the only roles that decide a half-day leave. */
  canDecideHalfDay?: boolean;
  /** R2-168/240: Owner revokes any approved leave; anyone else who could cancel it pending may, until its start date. */
  canRevoke?: boolean;
  initialEmployeeId?: string;
}

export function LeaveScreen({ leaves, employees, canApprove, canDecideHalfDay = false, canRevoke = false, initialEmployeeId }: Props) {
  const [open, setOpen] = useState(false);
  const [empId, setEmpId] = useState(initialEmployeeId ?? '');
  // R2-100: ?employeeId= FILTERS the history; it never pops the request form open.
  const [historyOf, setHistoryOf] = useState<string | null>(initialEmployeeId ?? null);
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState('CL');
  const [reason, setReason] = useState('');
  const [revokeFor, setRevokeFor] = useState<LeaveRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('ALL');
  const [empSearch, setEmpSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  // shortcut: browser date, not the factory zone; the server re-checks
  const todayKey = new Date().toISOString().slice(0, 10);

  const empOptions: SelectOption[] = [
    ...employees.map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})` })),
  ];

  const filtered = leaves
    .filter((l) => !historyOf || l.employee?.id === historyOf)
    .filter((l) => filter === 'ALL' ? true : l.status === filter)
    .filter((l) => !empSearch.trim() || (l.employee?.name ?? '').toLowerCase().includes(empSearch.toLowerCase()) || (l.employee?.employeeCode ?? '').toLowerCase().includes(empSearch.toLowerCase()));

  const paged = usePagedRows(filtered, `${filter}|${empSearch}|${historyOf ?? ''}`);
  const typeOptions: SelectOption[] = [...LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABEL[t] })), { value: HALF_DAY_LEAVE, label: leaveTypeLabel(HALF_DAY_LEAVE) }];
  const isHalfDay = leaveType === HALF_DAY_LEAVE;
  const rangeError = date && !isHalfDay ? validateLeaveRange(date, endDate || null) : null;
  const dayCount = date && !rangeError ? countLeaveWorkingDays(date, endDate || null) : 0;

  const handleRequest = () => startTransition(async () => {
    const res = await requestLeaveAction(empId, date, reason || undefined, { endDate: isHalfDay ? null : endDate || null, leaveType });
    if (!res.ok) { toast('error', res.detail); return; }
    setEmpId(''); setDate(''); setEndDate(''); setLeaveType('CL'); setReason(''); setOpen(false);
  });

  const handleApprove = (id: string, approve: boolean) => startTransition(async () => {
    const res = await approveLeaveAction(id, approve);
    if (!res.ok) { toast('error', res.detail); return; }
    if (res.value.skippedDates.length > 0) toast('info', `Register not changed for ${res.value.skippedDates.join(', ')} (already has a punch, an edit, or a closed month)`);
  });

  const withdraw = (id: string) => startTransition(async () => {
    const res = await cancelLeaveRequestAction(id);
    if (!res.ok) toast('error', res.detail);
  });
  const revoke = () => startTransition(async () => {
    if (!revokeFor) return;
    const res = await cancelLeaveRequestAction(revokeFor.id, revokeReason);
    if (!res.ok) { toast('error', res.detail); return; }
    setRevokeFor(null); setRevokeReason('');
  });

  const columns: Column<LeaveRow>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <div className="font-medium text-sm">{r.employee?.name ?? '—'}</div>
          <div className="text-xs text-gray-500">{r.employee?.employeeCode}</div>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      // A leave day is a date-only value (UTC midnight), so it is read in UTC to keep the same calendar day.
      render: (r) => {
        const first = formatFactoryDate(new Date(r.date), 'UTC');
        if (!r.endDate) return first;
        const startKey = new Date(r.date).toISOString().slice(0, 10);
        const endKey = new Date(r.endDate).toISOString().slice(0, 10);
        return (
          <div>
            <div>{first} – {formatFactoryDate(new Date(r.endDate), 'UTC')}</div>
            <div className="text-xs text-gray-500">{countLeaveWorkingDays(startKey, endKey)} working days</div>
          </div>
        );
      },
    },
    { key: 'type', header: 'Type', render: (r) => leaveTypeLabel(r.leaveType) },
    { key: 'reason', header: 'Reason', render: (r) => r.reason ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</StatusBadge>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) => {
        const mayDecide = canApprove && (r.canDecide ?? (r.leaveType !== HALF_DAY_LEAVE || canDecideHalfDay));
        return (
          <div className="flex gap-2 justify-end">
            {r.status === 'PENDING' && mayDecide && (
              <>
                <Button variant="ghost" onClick={() => handleApprove(r.id, true)} disabled={isPending}>Approve</Button>
                <Button variant="ghost" onClick={() => handleApprove(r.id, false)} disabled={isPending}>Reject</Button>
              </>
            )}
            {r.status === 'PENDING' && canApprove && !mayDecide && (
              <span className="self-center text-xs text-amber-700">Needs Admin/Owner approval</span>
            )}
            {r.status === 'PENDING' && canApprove && (
              <Button variant="ghost" onClick={() => withdraw(r.id)} disabled={isPending}>Withdraw</Button>
            )}
            {r.status === 'APPROVED' && (canRevoke || new Date(r.date).toISOString().slice(0, 10) > todayKey) && (
              <Button variant="ghost" onClick={() => { setRevokeFor(r); setRevokeReason(''); }} disabled={isPending}>Revoke</Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Leave Requests</h1>
        <Button onClick={() => setOpen(true)}>+ Request Leave</Button>
      </div>

      {historyOf && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Showing leave history for {employees.find((e) => e.id === historyOf)?.name ?? 'this employee'}
          <Button variant="ghost" onClick={() => setHistoryOf(null)}>Show everyone</Button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`inline-flex min-h-11 items-center rounded-md px-3 text-base font-medium transition-colors ${
              filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            {f === 'PENDING' && leaves.filter((l) => l.status === 'PENDING').length > 0 && (
              <span className="ml-1 bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded-full">
                {leaves.filter((l) => l.status === 'PENDING').length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div>
        <input type="search" placeholder="Search by employee…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>

      <DataTable
        columns={columns}
        rows={paged.pageRows}
        rowKey={(r) => r.id}
        emptyTitle="No leave requests"
        emptyBody="No leave requests found for the selected filter."
      />
      <ListPager page={paged.page} total={paged.total} setPage={paged.setPage} />

      <SlideOver open={open} onClose={() => setOpen(false)} title="Request Leave">
        <div className="flex flex-col gap-4 p-4">
          <Combobox label="Employee" value={empId} options={empOptions} onChange={setEmpId} />
          <Select label="Leave type" value={leaveType} options={typeOptions} onChange={setLeaveType} />
          <DateInput label="From" value={date} onChange={(e) => setDate(e.target.value)} />
          {!isHalfDay && <DateInput label="To (leave blank for a single day)" value={endDate} onChange={(e) => setEndDate(e.target.value)} />}
          {isHalfDay && <p className="text-sm text-slate-600">Half-day leave is one day: 0.5 day is taken off attendance and pay once an Owner or Admin approves it.</p>}
          {rangeError && <p role="alert" className="text-sm text-red-600">{rangeError}</p>}
          {dayCount > 0 && <p className="text-sm text-slate-600">{dayCount} working {dayCount === 1 ? 'day' : 'days'} (Sundays are not counted in a range)</p>}
          <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleRequest} disabled={isPending || !empId || !date || !!rangeError}>Submit</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={!!revokeFor} onClose={() => setRevokeFor(null)} title="Revoke approved leave">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">{revokeFor?.employee?.name} · the register rows this leave made are put back. A closed month cannot be revoked.</p>
          <Input label="Reason (required)" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={revoke} disabled={isPending || revokeReason.trim().length < 3}>Revoke leave</Button>
            <Button variant="ghost" onClick={() => setRevokeFor(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
