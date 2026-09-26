'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/mis/kit/button';
import { DateInput, Input, NumberInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { proposeExtraPayDayAction } from '@/app/(mis)/mis/attendance/extra-pay/actions';

/**
 * 25.4/D28 — propose an extra-pay day. DEPARTMENTS scope is not offered here: Super Attendance
 * Operator (one of the two roles D28 names as a proposer) holds `attendance.write` but not
 * `masters.read`, so a department picker would fail to load for them. ALL_PRESENT and EMPLOYEES
 * both resolve through `employees.read`, which every proposer holds.
 */

type EmployeeOption = { id: string; name: string; employeeCode: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ExtraPayProposeScreen({ employees }: { employees: EmployeeOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(todayIso());
  const [kind, setKind] = useState<'MULTIPLIER' | 'FLAT_AMOUNT'>('FLAT_AMOUNT');
  const [value, setValue] = useState('');
  const [scope, setScope] = useState<'ALL_PRESENT' | 'EMPLOYEES'>('ALL_PRESENT');
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
      try {
        await proposeExtraPayDayAction({
          date,
          kind,
          value: v,
          scope,
          employeeIds: scope === 'EMPLOYEES' ? [...employeeIds] : undefined,
          reason: reason.trim(),
        });
        setSubmitted(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not submit.');
      }
    });
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-lg font-semibold text-green-800">Sent for approval</p>
          <p className="mt-1 text-sm text-green-700">The Owner will see this in the approval queue before it affects payroll.</p>
          <Button className="mt-4" onClick={() => { setSubmitted(false); setValue(''); setReason(''); setEmployeeIds(new Set()); }}>
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
        options={[{ value: 'ALL_PRESENT', label: 'Everyone present that day' }, { value: 'EMPLOYEES', label: 'Specific employees' }]}
        onChange={(v) => setScope(v as 'ALL_PRESENT' | 'EMPLOYEES')}
      />

      {scope === 'EMPLOYEES' && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
          {employees.map((emp) => (
            <label key={emp.id} className="flex min-h-11 items-center gap-2 px-2 text-sm text-slate-800">
              <input type="checkbox" checked={employeeIds.has(emp.id)} onChange={() => toggleEmployee(emp.id)} className="h-5 w-5 rounded border-slate-300" />
              {emp.name} <span className="font-mono text-xs text-slate-400">{emp.employeeCode}</span>
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
    </div>
  );
}
