'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { Input } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { requestLeaveAction, approveLeaveAction } from '@/app/(mis)/mis/attendance/actions';

type Employee = { id: string; name: string; employeeCode: string };
type LeaveRow = {
  id: string;
  date: Date | string;
  status: string;
  reason: string | null;
  employee: Employee | null;
};

const STATUS_TONE: Record<string, 'good' | 'warning' | 'critical' | 'neutral'> = {
  APPROVED: 'good',
  PENDING: 'warning',
  REJECTED: 'critical',
};

interface Props {
  leaves: LeaveRow[];
  employees: Employee[];
  canApprove: boolean;
  initialEmployeeId?: string;
}

export function LeaveScreen({ leaves, employees, canApprove, initialEmployeeId }: Props) {
  const [open, setOpen] = useState(!!initialEmployeeId);
  const [empId, setEmpId] = useState(initialEmployeeId ?? '');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [empSearch, setEmpSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const empOptions: SelectOption[] = [
    { value: '', label: '— Select Employee —' },
    ...employees.map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})` })),
  ];

  const filtered = leaves
    .filter((l) => filter === 'ALL' ? true : l.status === filter)
    .filter((l) => !empSearch.trim() || (l.employee?.name ?? '').toLowerCase().includes(empSearch.toLowerCase()) || (l.employee?.employeeCode ?? '').toLowerCase().includes(empSearch.toLowerCase()));

  const handleRequest = () => startTransition(async () => {
    await requestLeaveAction(empId, date, reason || undefined);
    setEmpId(''); setDate(''); setReason(''); setOpen(false);
  });

  const handleApprove = (id: string, approve: boolean) => startTransition(async () => {
    await approveLeaveAction(id, approve);
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
      render: (r) => new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    },
    { key: 'reason', header: 'Reason', render: (r) => r.reason ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</StatusBadge>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        canApprove && r.status === 'PENDING' ? (
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => handleApprove(r.id, true)} disabled={isPending}>
              Approve
            </Button>
            <Button variant="ghost" onClick={() => handleApprove(r.id, false)} disabled={isPending}>
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Leave Requests</h1>
        <Button onClick={() => setOpen(true)}>+ Request Leave</Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
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
        rows={filtered}
        rowKey={(r) => r.id}
        emptyTitle="No leave requests"
        emptyBody="No leave requests found for the selected filter."
      />

      <SlideOver open={open} onClose={() => setOpen(false)} title="Request Leave">
        <div className="flex flex-col gap-4 p-4">
          <Select label="Employee" value={empId} options={empOptions} onChange={setEmpId} />
          <Input label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleRequest} disabled={isPending || !empId || !date}>Submit</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
