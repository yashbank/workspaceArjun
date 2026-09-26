'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import type { MisPayComponent } from '@/generated/prisma/enums';
import { setPayComponentAction } from '@/app/(mis)/mis/employees/[id]/actions';

interface Employee {
  id: string;
  name: string;
  nameHi?: string | null;
  code: string;
  role: string;
  isActive: boolean;
  createdAt: Date | string;
}

interface MonthStats {
  present: number;
  absent: number;
  leave: number;
  totalOT: number;
}

type PayComponentMap = Record<MisPayComponent, boolean>;

interface Props {
  employee: Employee;
  monthStats: MonthStats;
  canWrite: boolean;
  /** null for anyone but the Owner (wages.read) — the whole card is absent then, never disabled (25.1). */
  payComponents: PayComponentMap | null;
}

const COMPONENT_LABELS: Record<MisPayComponent, string> = {
  BASIC: 'Basic Wage / Salary',
  HRA: 'HRA',
  ALLOWANCE: 'Allowance',
  OT: 'Overtime',
  BONUS: 'Bonus',
};

function fmtRole(r: string) { return r.replace(/_/g, ' '); }
function fmtDate(d: Date | string) { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtOT(m: number) { const h = Math.floor(m / 60); const min = m % 60; return h > 0 ? `${h}h ${min}m` : `${min}m`; }

export function EmployeeProfileScreen({ employee, monthStats, canWrite, payComponents }: Props) {
  const initials = employee.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const [isPending, startTransition] = useTransition();
  const toggle = (component: MisPayComponent, enabled: boolean) => {
    startTransition(async () => { await setPayComponentAction(employee.id, component, enabled); });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">
      {/* Breadcrumb — the link is a real tap target (24G-02), not a 20px sliver of text. */}
      <nav className="flex items-center gap-2 text-base text-gray-500">
        <Link href="/mis/employees" className="inline-flex min-h-11 items-center hover:text-gray-700">Employees</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{employee.name}</span>
      </nav>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-700 shrink-0">
            {initials}
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{employee.name}</h1>
                {employee.nameHi && <div className="text-sm text-gray-500">{employee.nameHi}</div>}
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${employee.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                {employee.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-gray-500">Employee Code</div>
                <div className="font-medium text-gray-900 mt-0.5 font-mono">{employee.code}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Role</div>
                <div className="font-medium text-gray-900 mt-0.5">{fmtRole(employee.role)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Joined</div>
                <div className="font-medium text-gray-900 mt-0.5">{fmtDate(employee.createdAt)}</div>
              </div>
            </div>
          </div>
        </div>

        {canWrite && (
          <div className="mt-5 pt-5 border-t border-gray-100 flex gap-3">
            <Link href={`/mis/print/badge/${employee.id}`} target="_blank">
              <Button variant="ghost">Print Badge</Button>
            </Link>
            <Link href={`/mis/attendance/leave?employeeId=${employee.id}`}>
              <Button variant="ghost">Leave History</Button>
            </Link>
          </div>
        )}
      </div>

      {/* This month stats */}
      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">This Month</h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Present', value: monthStats.present, color: 'text-green-600' },
            { label: 'Absent', value: monthStats.absent, color: 'text-red-600' },
            { label: 'Leave', value: monthStats.leave, color: 'text-yellow-600' },
            { label: 'Overtime', value: fmtOT(monthStats.totalOT), color: 'text-blue-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Payslip components (25.1) — ABSENT for anyone but the Owner, never disabled. */}
      {payComponents && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Payslip rows · visible to you only</p>
          <h2 className="mt-1 text-sm font-medium text-gray-700">Which rows print on this person&apos;s payslip</h2>
          <div className="mt-3 flex flex-col gap-1">
            {(Object.keys(COMPONENT_LABELS) as MisPayComponent[]).map((component) => (
              <label key={component} className="flex min-h-11 items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={payComponents[component]}
                  disabled={isPending}
                  onChange={(e) => toggle(component, e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300"
                />
                {COMPONENT_LABELS[component]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">A row that is off contributes nothing and does not print.</p>
        </div>
      )}

      {/* Quick links */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/mis/attendance">
            <Button variant="ghost">Attendance Log</Button>
          </Link>
          <Link href="/mis/attendance/leave">
            <Button variant="ghost">Leave Requests</Button>
          </Link>
          <Link href="/mis/kiosk">
            <Button variant="ghost">Kiosk</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
