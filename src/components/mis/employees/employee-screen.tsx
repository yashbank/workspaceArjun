'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Pagination, HiddenParams } from '@/components/mis/kit/pagination';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input } from '@/components/mis/kit/input';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { WagePicker } from '@/components/mis/payroll/wage-picker';
import type { WageTypeCode } from '@/server/mis/wage-type';
import { isMisRole } from '@/lib/mis/roles';
import { saveEmployeeAction, deleteEmployeeAction, restoreEmployeeAction, uploadEmployeePhotoAction } from '@/app/(mis)/mis/employees/actions';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PhotoPicker } from './photo-picker';
import { unwrap } from '@/lib/mis/action-result';
import { managerOptionLabel } from '@/lib/mis/employee-labels';
import { normaliseBankDetails } from '@/lib/mis/bank-details';

// Same visual weight as the kit's `Button` ghost variant, so a navigation
// link (View, Badge) sits in the same row as an action button (Edit,
// Delete) without one looking like an afterthought — 24G-01: this row was
// four different sizes, from 20px text links up to 44px buttons.
const actionLinkClass =
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';

type Employee = {
  id: string; employeeCode: string; name: string; nameHi: string | null; phone: string | null; role: string; isActive: boolean;
  deletedAt: Date | null; managerId: string | null; userProfile: { email: string } | null;
  department?: { name: string } | null;
  departmentId?: string | null;
  // Phase 25 (25.2/25.3, D28) — none of the three is money; wageTypeCode is a CODE, never an amount (D33).
  wageTypeCode: string | null; payType: 'MONTHLY' | 'DAILY'; sundayPaid: boolean;
  photoUrl?: string | null;
  // R2-110 - present only when the server sent them (employees.write: Owner, Admin).
  bankName?: string | null; bankAccountNo?: string | null; ifsc?: string | null;
};
type Props = {
  employees: Employee[];
  canWrite: boolean;
  /**
   * Whether the server narrowed this list to the caller's pool. Resolved by
   * `isPoolScoped` on the server — the screen is told, it never works it out,
   * and it never sees a row it is not allowed to see in order to count one.
   */
  scoped: boolean;
  /** Gates the wage-code picker (wages.read) — Admin can edit everything else here, not this. */
  isOwner: boolean;
  wageCodes: WageTypeCode[];
  /** Active departments for the Department picker (R2-86). */
  departments?: { id: string; name: string }[];
  /** R2-83: `employees` is now one page; the manager picker and the manager-name lookup still need the whole (D4-scoped) roll. */
  allPeople?: Employee[];
  /** R2-83: the server-side page — total matching rows, the page number, and the URL params kept in the page links. */
  paging?: { total: number; page: number; params: Record<string, string | undefined> };
  /** R2-88: the profile's Edit button lands here with ?edit=<id>; the form opens on that person. */
  initialEditId?: string;
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

export function EmployeeScreen({ employees, canWrite, scoped, isOwner, wageCodes, departments = [], initialEditId, allPeople, paging }: Props) {
  const everyone = allPeople ?? employees;
  const { confirm, confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('WORKER');
  const [managerId, setManagerId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [wageTypeCode, setWageTypeCode] = useState<string | null>(null);
  const [payType, setPayType] = useState<'MONTHLY' | 'DAILY'>('DAILY');
  const [sundayPaid, setSundayPaid] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();

  const openAdd = () => { setEditing(null); setCode(''); setName(''); setNameHi(''); setPhone(''); setRole('WORKER'); setManagerId(null); setDepartmentId(null); setWageTypeCode(null); setPayType('DAILY'); setSundayPaid(false); setBankName(''); setBankAccountNo(''); setIfsc(''); setSaveError(null); setPhoto(null); setOpen(true); };
  const openEdit = (emp: Employee) => { setEditing(emp); setCode(emp.employeeCode); setName(emp.name); setNameHi(emp.nameHi ?? ''); setPhone(emp.phone ?? ''); setRole(emp.role); setManagerId(emp.managerId); setDepartmentId(emp.departmentId ?? null); setWageTypeCode(emp.wageTypeCode); setPayType(emp.payType); setSundayPaid(emp.sundayPaid); setBankName(emp.bankName ?? ''); setBankAccountNo(emp.bankAccountNo ?? ''); setIfsc(emp.ifsc ?? ''); setSaveError(null); setPhoto(null); setOpen(true); };

  // R2-88: open the edit form once for the person named in ?edit=, never again after it is closed.
  const [autoOpened, setAutoOpened] = useState(false);
  if (!autoOpened && canWrite) {
    const target = initialEditId ? everyone.find((e) => e.id === initialEditId && !e.deletedAt) : undefined;
    setAutoOpened(true);
    if (target) openEdit(target);
  }

  // Picked from the same, already-D4-scoped list this screen received — a
  // manager can only be someone the caller can already see (visibility.ts).
  const managerOptions: SelectOption[] = everyone
    .filter((e) => e.id !== editing?.id && !e.deletedAt)
    .map((e) => ({ value: e.id, label: managerOptionLabel(e, roleLabel) }));

  const handleSave = () => {
    setSaveError(null);
    // R2-110: the same check the server runs, so a typo is caught before the round trip.
    if (canWrite) {
      try { normaliseBankDetails({ bankName, bankAccountNo, ifsc }); }
      catch (e) { setSaveError(e instanceof Error ? e.message : 'Check the bank details.'); return; }
    }
    startTransition(async () => {
      try {
        const saved = unwrap(await saveEmployeeAction(editing?.id ?? null, {
          employeeCode: code,
          name,
          nameHi: nameHi || undefined,
          phone: phone || undefined,
          // The <Select> only ever offers ROLE_OPTIONS' values (every MisRoleName), so this is
          // always true in practice — the guard keeps the type honest without an unchecked cast.
          role: isMisRole(role) ? role : undefined,
          managerId,
          departmentId,
          // Only an Owner's form ever holds these — an Admin's form never renders the section
          // that sets them, so they stay `undefined` (unchanged) on an Admin's save.
          ...(isOwner ? { wageTypeCode, payType, sundayPaid } : {}),
          // The form (and these fields) exist only for employees.write holders - Owner and Admin.
          ...(canWrite ? { bankName, bankAccountNo, ifsc } : {}),
        }));
        // V2 Epic 7: the photo rides on the saved row's id, so it goes up after the save. If the
        // upload fails the row already exists — switch to edit mode so a retry never creates a twin.
        if (photo) {
          const form = new FormData();
          form.append('photo', photo);
          try {
            unwrap(await uploadEmployeePhotoAction(saved.id, form));
          } catch (photoError) {
            setEditing((current) => current ?? { id: saved.id, employeeCode: code, name, nameHi: nameHi || null, phone: phone || null, role, isActive: true, deletedAt: null, managerId, userProfile: null, wageTypeCode, payType, sundayPaid });
            setSaveError(`Saved, but the photo did not upload: ${photoError instanceof Error ? photoError.message : 'try again'}`);
            return;
          }
        }
        setOpen(false);
      } catch (error) {
        // A manager-cycle rejection is a form error, not a page-level crash —
        // shown inline so the Owner can just pick someone else and retry.
        setSaveError(error instanceof Error ? error.message : 'Could not save.');
      }
    });
  };

  const search = paging?.params.q ?? '';
  const filtered = employees;

  function downloadCsv() {
    const headers = ['Code', 'Name', 'Name (Hindi)', 'Phone', 'Role', 'Login Email', 'Active'];
    const rows = employees.map(e => [e.employeeCode, e.name, e.nameHi ?? '', e.phone ?? '', roleLabel(e.role), e.userProfile?.email ?? '', e.isActive ? 'Yes' : 'No']);
    const lines = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'employees.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<Employee>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.employeeCode}</span> },
    { key: 'name', header: 'Name', render: (r) => <div><div>{r.name}</div>{r.nameHi && <div className="text-xs text-slate-500">{r.nameHi}</div>}</div> },
    { key: 'department', header: 'Department', hideOnMobile: true, render: (r) => r.department?.name ?? <span className="text-slate-400 text-xs">—</span> },
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
        const manager = everyone.find((e) => e.id === r.managerId);
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
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={async () => {
          if (!(await confirm({ title: 'Deactivate employee', message: `Are you sure you want to deactivate ${r.name}? They will no longer be able to log in or punch at the gate.`, confirmLabel: 'Deactivate', destructive: true }))) return;
          startTransition(async () => { setRowError(null); const res = await deleteEmployeeAction(r.id); if (!res.ok) setRowError(res.detail); });
        }}>Delete</Button>}
        {r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { setRowError(null); const res = await restoreEmployeeAction(r.id); if (!res.ok) setRowError(res.detail); })}>Restore</Button>}
      </div>
    )},
  ];

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-4">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Employees</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={downloadCsv}>↓ CSV</Button>
          {canWrite && <Button onClick={openAdd}>+ Add Employee</Button>}
        </div>
      </div>
      {rowError && <p role="alert" className="text-sm text-red-600">{rowError}</p>}
      <form method="get" className="flex items-center gap-3">
        {paging && <HiddenParams params={paging.params} />}
        <input
          type="search"
          placeholder="Search employees…"
          name="q"
          defaultValue={search}
          className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
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
      {paging && <Pagination basePath="/mis/employees" params={paging.params} page={paging.page} total={paging.total} />}
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Employee' : 'Add Employee'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Employee Code" value={code} onChange={(e) => setCode(e.target.value)} required />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Name (Hindi)" value={nameHi} onChange={(e) => setNameHi(e.target.value)} />
          <Input label="Phone (emergency contact)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <PhotoPicker file={photo} onChange={setPhoto} currentUrl={editing?.photoUrl ?? null} />
          <Select label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
          <Select
            label="Reports to"
            value={managerId ?? ''}
            options={[{ value: '', label: 'No manager' }, ...managerOptions]}
            onChange={(v) => setManagerId(v || null)}
          />
          <Select
            label="Department"
            value={departmentId ?? ''}
            options={[{ value: '', label: 'No department' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
            onChange={(v) => setDepartmentId(v || null)}
          />
          <p className="text-sm text-slate-500">
            Sets who can see this person&apos;s records — their manager, and everyone above.
          </p>
          {isOwner && (
            <div className="flex flex-col gap-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Pay setup · visible to you only</p>
              <WagePicker value={wageTypeCode} options={wageCodes} onChange={setWageTypeCode} />
              <Select
                label="Pay type"
                value={payType}
                options={[{ value: 'DAILY', label: 'Daily' }, { value: 'MONTHLY', label: 'Monthly' }]}
                onChange={(v) => setPayType(v as 'MONTHLY' | 'DAILY')}
              />
              <label className="flex min-h-11 items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" checked={sundayPaid} onChange={(e) => setSundayPaid(e.target.checked)} className="h-5 w-5 rounded border-slate-300" />
                Paid on Sundays (only affects a Daily employee — Monthly staff are always paid Sundays)
              </label>
              {!wageTypeCode && (
                <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">No wage type set — payroll will fall back to the factory default until one is picked.</p>
              )}
            </div>
          )}
          {canWrite && (
            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Bank details · Owner and Admin only</p>
              <Input label="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              <Input label="Account number" value={bankAccountNo} inputMode="numeric" autoComplete="off" onChange={(e) => setBankAccountNo(e.target.value)} />
              <Input label="IFSC" value={ifsc} autoComplete="off" onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
              <p className="text-xs text-slate-500">Used for the month-end bank transfer file. Leave all three blank if not known yet.</p>
            </div>
          )}
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
