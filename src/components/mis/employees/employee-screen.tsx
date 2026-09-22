'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input } from '@/components/mis/kit/input';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { saveEmployeeAction, deleteEmployeeAction, restoreEmployeeAction } from '@/app/(mis)/mis/employees/actions';

// Same visual weight as the kit's `Button` ghost variant, so a navigation
// link (View, Badge) sits in the same row as an action button (Edit,
// Delete) without one looking like an afterthought — 24G-01: this row was
// four different sizes, from 20px text links up to 44px buttons.
const actionLinkClass =
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';

type Employee = { id: string; employeeCode: string; name: string; nameHi: string | null; role: string; isActive: boolean; deletedAt: Date | null; managerId: string | null; userProfile: { email: string } | null };
type Props = {
  employees: Employee[];
  canWrite: boolean;
  /**
   * Whether the server narrowed this list to the caller's pool. Resolved by
   * `isPoolScoped` on the server — the screen is told, it never works it out,
   * and it never sees a row it is not allowed to see in order to count one.
   */
  scoped: boolean;
};

const ROLE_OPTIONS: SelectOption[] = [
  { value: 'WORKER', label: 'Worker' },
  { value: 'ATTENDANCE_OPERATOR', label: 'Attendance Operator' },
  { value: 'SUPER_ATTENDANCE_OPERATOR', label: 'Senior Attendance Operator' },
  { value: 'QC', label: 'QC' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'STORE_GUY', label: 'Store Manager' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'OWNER', label: 'Owner' },
];

const roleTone = (role: string) => {
  if (role === 'OWNER') return 'critical' as const;
  if (role === 'ADMIN') return 'warning' as const;
  if (role === 'SUPERVISOR' || role === 'STORE_GUY') return 'info' as const;
  if (role === 'QC') return 'good' as const;
  return 'neutral' as const;
};

const roleLabel = (role: string) => ROLE_OPTIONS.find(o => o.value === role)?.label ?? role;

export function EmployeeScreen({ employees, canWrite, scoped }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [role, setRole] = useState('WORKER');
  const [managerId, setManagerId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openAdd = () => { setEditing(null); setCode(''); setName(''); setNameHi(''); setRole('WORKER'); setManagerId(null); setSaveError(null); setOpen(true); };
  const openEdit = (emp: Employee) => { setEditing(emp); setCode(emp.employeeCode); setName(emp.name); setNameHi(emp.nameHi ?? ''); setRole(emp.role); setManagerId(emp.managerId); setSaveError(null); setOpen(true); };

  // Picked from the same, already-D4-scoped list this screen received — a
  // manager can only be someone the caller can already see (visibility.ts).
  const managerOptions: SelectOption[] = employees
    .filter((e) => e.id !== editing?.id && !e.deletedAt)
    .map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})` }));

  const handleSave = () => {
    setSaveError(null);
    startTransition(async () => {
      try {
        await saveEmployeeAction(editing?.id ?? null, {
          employeeCode: code,
          name,
          nameHi: nameHi || undefined,
          role,
          managerId,
        });
        setOpen(false);
      } catch (error) {
        // A manager-cycle rejection is a form error, not a page-level crash —
        // shown inline so the Owner can just pick someone else and retry.
        setSaveError(error instanceof Error ? error.message : 'Could not save.');
      }
    });
  };

  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.employeeCode.toLowerCase().includes(search.toLowerCase()) || (e.nameHi ?? '').toLowerCase().includes(search.toLowerCase()))
    : employees;

  function downloadCsv() {
    const headers = ['Code', 'Name', 'Name (Hindi)', 'Role', 'Login Email', 'Active'];
    const rows = employees.map(e => [e.employeeCode, e.name, e.nameHi ?? '', roleLabel(e.role), e.userProfile?.email ?? '', e.isActive ? 'Yes' : 'No']);
    const lines = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'employees.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<Employee>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.employeeCode}</span> },
    { key: 'name', header: 'Name', render: (r) => <div><div>{r.name}</div>{r.nameHi && <div className="text-xs text-slate-500">{r.nameHi}</div>}</div> },
    { key: 'role', header: 'Role', render: (r) => <StatusBadge tone={roleTone(r.role)}>{roleLabel(r.role)}</StatusBadge> },
    {
      key: 'manager',
      header: 'Reports to',
      hideOnMobile: true,
      render: (r) => {
        if (!r.managerId) return <span className="text-slate-400 text-xs">No manager set</span>;
        // The manager may be outside this (D4-scoped) list's own visibility —
        // an ancestor is never included alongside self + descendants — so a
        // miss here means "not visible to you", not "unassigned".
        const manager = employees.find((e) => e.id === r.managerId);
        return manager ? manager.name : <span className="text-slate-400 text-xs">Assigned (outside your view)</span>;
      },
    },
    { key: 'email', header: 'Login', render: (r) => r.userProfile?.email ? <span className="break-all">{r.userProfile.email}</span> : <span className="text-slate-400 text-xs">No login</span> },
    { key: 'isActive', header: 'Status', render: (r) => <StatusBadge tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={`/mis/employees/${r.id}`} className={actionLinkClass}>View</Link>
        <Link href={`/mis/print/badge/${r.id}`} target="_blank" className={actionLinkClass}>Badge</Link>
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await deleteEmployeeAction(r.id); })}>Delete</Button>}
        {r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await restoreEmployeeAction(r.id); })}>Restore</Button>}
      </div>
    )},
  ];

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Employees</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={downloadCsv}>↓ CSV</Button>
          {canWrite && <Button onClick={openAdd}>+ Add Employee</Button>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Search employees…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      {/*
        Three different empty lists, three different sentences. Telling someone
        to "add employees" when the roll is full and they simply cannot see it
        sends them off to create a duplicate of a person who already exists.
      */}
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        emptyTitle={
          employees.length > 0
            ? 'No match'
            : scoped
              ? 'Nobody reports to you yet'
              : 'No employees yet'
        }
        emptyBody={
          employees.length > 0
            ? `Nothing here matches “${search}”. Clear the search to see the whole list.`
            : scoped
              ? 'This list shows the people in your pool. Nobody has been placed under you, so there is no one to show — an owner or admin assigns that.'
              : 'Add employees to the factory roll.'
        }
      />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Employee' : 'Add Employee'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Employee Code" value={code} onChange={(e) => setCode(e.target.value)} required />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Name (Hindi)" value={nameHi} onChange={(e) => setNameHi(e.target.value)} />
          <Select label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
          <Select
            label="Reports to"
            value={managerId ?? ''}
            options={[{ value: '', label: 'No manager' }, ...managerOptions]}
            onChange={(v) => setManagerId(v || null)}
          />
          <p className="text-sm text-slate-500">
            Sets who can see this person&apos;s records — their manager, and everyone above.
          </p>
          {saveError && (
            <p role="alert" className="text-sm text-red-600">{saveError}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isPending || !name || !code}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
