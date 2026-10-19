'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/mis/kit/button';
import { DateInput, Input, NumberInput } from '@/components/mis/kit/input';
import { ListPager, usePagedRows } from './list-pager';
import { Select } from '@/components/mis/kit/select';
import { DEFAULT_FACTORY_TIMEZONE, factoryDateKey } from '@/lib/mis/factory-time';
import { proposeExtraPayDayAction } from '@/app/(mis)/mis/attendance/extra-pay/actions';

/**
 * 25.4/D28 — propose an extra-pay day. R2-115: DEPARTMENTS scope is offered too; its options come from
 * `listDepartmentOptions` (gated on `attendance.write`, the proposer's own door), not `masters.read`, which a
 * Super Attendance Operator does not hold.
 */

type Proposal = { id: string; date: string; scope: string; reason: string; status: string; proposedByName: string | null };
type EmployeeOption = { id: string; name: string; employeeCode: string };

/** R2-116: case-insensitive contains-all-words filter. */
function filterBySearch<T>(rows: T[], query: string, text: (row: T) => string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((r) => { const t = text(r).toLowerCase(); return words.every((w) => t.includes(w)); });
}

function todayIso() {
  return factoryDateKey(new Date(), DEFAULT_FACTORY_TIMEZONE);
}

export function ExtraPayProposeScreen({ employees, departments = [], proposals = [] }: { employees: EmployeeOption[]; departments?: { id: string; name: string }[]; proposals?: Proposal[] }) {
  const [empSearch, setEmpSearch] = useState('');
  const [listSearch, setListSearch] = useState('');
  const shownEmployees = filterBySearch(employees, empSearch, (e) => `${e.name} ${e.employeeCode}`);
  const matchedProposals = filterBySearch(proposals, listSearch, (p) => `${p.date} ${p.reason} ${p.status} ${p.proposedByName ?? ''}`);
  const paged = usePagedRows(matchedProposals, listSearch);
  const shownProposals = paged.pageRows;
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(todayIso());
  const [kind, setKind] = useState<'MULTIPLIER' | 'FLAT_AMOUNT'>('FLAT_AMOUNT');
  const [value, setValue] = useState('');
  const [scope, setScope] = useState<'ALL_PRESENT' | 'EMPLOYEES' | 'DEPARTMENTS'>('ALL_PRESENT');
  const [departmentIds, setDepartmentIds] = useState<Set<string>>(new Set());
  const [employeeIds, setEmployeeIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const toggleEmployee = (id: string) => {
    setEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    setError(null);
    if (scope === 'EMPLOYEES' && employeeIds.size === 0) {
      setError('Pick at least one employee.');
      return;
    }
    if (scope === 'DEPARTMENTS' && departmentIds.size === 0) {
      setError('Pick at least one department.');
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    const v = Number.parseFloat(value);
    if (!(v > 0)) {
      setError('Value must be a positive number.');
      return;
    }
    startTransition(async () => {
      const result = await proposeExtraPayDayAction({
        date,
        kind,
        value: v,
        scope,
        employeeIds: scope === 'EMPLOYEES' ? [...employeeIds] : undefined,
        departmentIds: scope === 'DEPARTMENTS' ? [...departmentIds] : undefined,
        reason: reason.trim(),
      });
      if (result.ok) setSubmitted(true);
      else setError(result.detail);
    });
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-lg font-semibold text-green-800">Sent for approval</p>
          <p className="mt-1 text-sm text-green-700">The Owner will see this in the approval queue before it affects payroll.</p>
          <Button className="mt-4" onClick={() => { setSubmitted(false); setValue(''); setReason(''); setEmployeeIds(new Set()); setDepartmentIds(new Set()); }}>
            Propose another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 pb-24">
      <h1 className="text-xl font-semibold text-slate-900">Extra-pay day</h1>
      <p className="text-sm text-slate-600">
        Mark a date for extra pay — a festival bonus, a rush order, a holiday worked. It only affects payroll once the Owner approves.
      </p>

      <DateInput label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />

      <Select
        label="Kind"
        value={kind}
        options={[{ value: 'FLAT_AMOUNT', label: 'Flat amount (₹)' }, { value: 'MULTIPLIER', label: 'Multiplier (×)' }]}
        onChange={(v) => setKind(v as 'MULTIPLIER' | 'FLAT_AMOUNT')}
      />
      <NumberInput label={kind === 'FLAT_AMOUNT' ? 'Amount (₹)' : 'Multiplier (e.g. 2 for double)'} value={value} onChange={(e) => setValue(e.target.value)} required />

      <Select
        label="Who"
        value={scope}
        options={[{ value: 'ALL_PRESENT', label: 'Everyone present that day' }, { value: 'EMPLOYEES', label: 'Specific employees' }, { value: 'DEPARTMENTS', label: 'Specific department' }]}
        onChange={(v) => setScope(v as 'ALL_PRESENT' | 'EMPLOYEES' | 'DEPARTMENTS')}
      />

      {scope === 'EMPLOYEES' && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
          <input type="search" aria-label="Search employees" placeholder="Search employees…" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} className="mb-2 w-full min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500" />
          {shownEmployees.length === 0 && <p className="px-2 py-2 text-sm text-slate-500">No employee matches.</p>}
          {shownEmployees.map((emp) => (
            <label key={emp.id} className="flex min-h-11 items-center gap-2 px-2 text-sm text-slate-800">
              <input type="checkbox" checked={employeeIds.has(emp.id)} onChange={() => toggleEmployee(emp.id)} className="h-5 w-5 rounded border-slate-300" />
              {emp.name} <span className="font-mono text-xs text-slate-400">{emp.employeeCode}</span>
            </label>
          ))}
        </div>
      )}

      {scope === 'DEPARTMENTS' && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
          {departments.length === 0 && <p className="px-2 py-2 text-sm text-slate-500">No departments set up yet.</p>}
          {departments.map((d) => (
            <label key={d.id} className="flex min-h-11 items-center gap-2 px-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={departmentIds.has(d.id)}
                onChange={() => setDepartmentIds((prev) => { const next = new Set(prev); if (next.has(d.id)) next.delete(d.id); else next.add(d.id); return next; })}
                className="h-5 w-5 rounded border-slate-300"
              />
              {d.name}
            </label>
          ))}
        </div>
      )}

      <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Diwali bonus" required />

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} disabled={isPending}>{isPending ? 'Sending…' : 'Send for approval'}</Button>
        <Link href="/mis/attendance"><Button variant="ghost">Cancel</Button></Link>
      </div>

      {proposals.length > 0 && (
        <section aria-label="Proposals" className="mt-6 flex flex-col gap-3">
          <h2 className="text-base font-semibold text-slate-900">Proposals</h2>
          <input type="search" aria-label="Search proposals" placeholder="Search by date, reason, status or proposer…" value={listSearch} onChange={(e) => setListSearch(e.target.value)} className="w-full min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500" />
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Proposed by</th></tr>
              </thead>
              <tbody>
                {shownProposals.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-slate-500">No proposal matches.</td></tr>}
                {shownProposals.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">{p.date}</td>
                    <td className="px-3 py-2">{p.reason}</td>
                    <td className="px-3 py-2">{p.status.charAt(0) + p.status.slice(1).toLowerCase()}</td>
                    <td className="px-3 py-2">{p.proposedByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPager page={paged.page} total={paged.total} setPage={paged.setPage} />
        </section>
      )}
    </div>
  );
}
