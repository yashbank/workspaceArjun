'use client';
import { useState, useTransition } from 'react';

import {
  createBackupAction,
  deleteDataAction,
  previewDeleteAction,
  restoreBackupAction,
} from '@/app/(mis)/mis/settings/danger-zone/actions';
import { CONFIRM_DELETE_WORD, CONFIRM_RESTORE_WORD } from '@/lib/mis/data-reset-groups';

type Group = { id: string; label: string; description: string; requires: readonly string[]; rows: number };
type Backup = { id: string; createdAt: string; totalRows: number };
type Overview = { groups: Group[]; backups: Backup[]; storageOk: boolean };
type Preview = { groups: string[]; tables: { name: string; rows: number }[] };

const btn = 'rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50';

export function DangerZoneScreen({ overview }: { overview: Overview }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [backupId, setBackupId] = useState<string>(overview.backups[0]?.id ?? '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [restoreId, setRestoreId] = useState<string>(overview.backups[0]?.id ?? '');
  const [confirmRestore, setConfirmRestore] = useState('');
  const latest = overview.backups[0];

  const toggle = (id: string) => {
    setPreview(null);
    setConfirmDelete('');
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const run = (fn: () => Promise<void>) => start(async () => { setMessage(null); await fn(); });

  const backup = () => run(async () => {
    const r = await createBackupAction();
    if (!r.ok) return setMessage({ ok: false, text: r.detail });
    setBackupId(r.backup.id);
    setRestoreId(r.backup.id);
    setMessage({ ok: true, text: `Backup saved and checked (${r.backup.totalRows} records). Reload this page to see it in the list.` });
  });

  const showPreview = () => run(async () => {
    const r = await previewDeleteAction(selected);
    if (!r.ok) return setMessage({ ok: false, text: r.detail });
    setPreview({ groups: r.groups, tables: r.tables });
  });

  const remove = () => run(async () => {
    const r = await deleteDataAction(selected, backupId, confirmDelete);
    if (!r.ok) return setMessage({ ok: false, text: r.detail });
    setPreview(null); setConfirmDelete(''); setSelected([]);
    setMessage({ ok: true, text: `Deleted ${r.rowsDeleted} records. Your backup is kept, so you can restore it.` });
  });

  const restore = () => run(async () => {
    const r = await restoreBackupAction(restoreId, confirmRestore);
    if (!r.ok) return setMessage({ ok: false, text: r.detail });
    setConfirmRestore('');
    setMessage({ ok: true, text: `Restored ${r.rowsRestored} records and ${r.linksRestored} links. Nothing existing was overwritten.` });
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="text-xl font-semibold text-red-700">Danger Zone</h1>
      <p className="text-sm text-slate-600">
        Only the Owner sees this. Take a backup, then clear data. You can bring the backup back at any time. Logins,
        Owner and Admin accounts, settings and the audit log are never deleted.
      </p>

      {!overview.storageOk && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Backups cannot be saved on this server yet (no permanent storage). Ask your developer. Delete is switched off.
        </p>
      )}
      {message && (
        <p role="status" className={`rounded-lg border p-3 text-sm ${message.ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Step 1. Take a backup</h2>
        <p className="mt-1 text-sm text-slate-600">
          {latest ? `Latest backup: ${new Date(latest.createdAt).toLocaleString()} (${latest.totalRows} records).` : 'No backup yet.'} A delete needs a backup from the last hour.
        </p>
        <button className={`${btn} mt-3 bg-slate-900 text-white`} disabled={pending || !overview.storageOk} onClick={backup}>
          {pending ? 'Working…' : 'Take backup now'}
        </button>
      </section>

      <section className="rounded-2xl border border-red-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Step 2. Choose what to delete</h2>
        <div className="mt-2 flex flex-col gap-2">
          {overview.groups.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" className="mt-1" checked={selected.includes(g.id)} onChange={() => toggle(g.id)} />
              <span>
                <span className="font-medium text-slate-900">{g.label} <span className="text-slate-400">({g.rows} records)</span></span>
                <span className="block text-xs text-slate-500">{g.description}</span>
              </span>
            </label>
          ))}
        </div>
        <button className={`${btn} mt-3 bg-slate-100 text-slate-900`} disabled={pending || selected.length === 0} onClick={showPreview}>
          Show exactly what will be deleted
        </button>

        {preview && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-800">This will permanently remove:</p>
            <ul className="mt-1 text-sm text-red-900">
              {preview.tables.length === 0 && <li>Nothing. These tables are already empty.</li>}
              {preview.tables.map((t) => <li key={t.name}>{t.name.replace('mis_', '').replaceAll('_', ' ')}: {t.rows}</li>)}
            </ul>
            <label className="mt-3 block text-sm text-slate-700">
              Backup to rely on
              <select className="mt-1 block w-full rounded border border-slate-300 p-2" value={backupId} onChange={(e) => setBackupId(e.target.value)}>
                {overview.backups.map((b) => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleString()} ({b.totalRows} records)</option>)}
              </select>
            </label>
            <label className="mt-3 block text-sm text-slate-700">
              Type {CONFIRM_DELETE_WORD} to confirm
              <input className="mt-1 block w-full rounded border border-slate-300 p-2" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} autoComplete="off" />
            </label>
            <div className="mt-3 flex gap-2">
              <button className={`${btn} bg-red-700 text-white`} disabled={pending || confirmDelete !== CONFIRM_DELETE_WORD || !backupId || !overview.storageOk} onClick={remove}>
                Delete now
              </button>
              <button className={`${btn} bg-white text-slate-700`} onClick={() => { setPreview(null); setConfirmDelete(''); }}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Step 3. Restore a backup</h2>
        <p className="mt-1 text-sm text-slate-600">Puts back anything that is missing. It never overwrites or removes what is already there.</p>
        <select className="mt-2 block w-full rounded border border-slate-300 p-2 text-sm" value={restoreId} onChange={(e) => setRestoreId(e.target.value)}>
          {overview.backups.length === 0 && <option value="">No backups yet</option>}
          {overview.backups.map((b) => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleString()} ({b.totalRows} records)</option>)}
        </select>
        <label className="mt-3 block text-sm text-slate-700">
          Type {CONFIRM_RESTORE_WORD} to confirm
          <input className="mt-1 block w-full rounded border border-slate-300 p-2" value={confirmRestore} onChange={(e) => setConfirmRestore(e.target.value)} autoComplete="off" />
        </label>
        <button className={`${btn} mt-3 bg-slate-900 text-white`} disabled={pending || !restoreId || confirmRestore !== CONFIRM_RESTORE_WORD} onClick={restore}>
          Restore backup
        </button>
      </section>
    </div>
  );
}
