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
type Backup = { id: string; name?: string; createdAt: string; totalRows: number };
type Overview = { groups: Group[]; backups: Backup[]; storageOk: boolean };
type Preview = { groups: string[]; tree: { name: string; rows: number; depth: number }[] };

const btn = 'min-h-11 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50';
const field = 'mt-1 block min-h-12 w-full rounded border border-slate-300 p-2 text-base';
const tableLabel = (name: string) => name.replace('mis_', '').replaceAll('_', ' ');
const DOWNLOAD_GAP_MS = 600;
const downloadUrl = (id: string, kind: 'json' | 'csv') => `/api/mis/danger-zone/backup/${id}/${kind}`;

export function DangerZoneScreen({ overview }: { overview: Overview }) {
  const [pending, start] = useTransition();
  const [entered, setEntered] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accepted, setAccepted] = useState(false);
  // Only a backup taken for THIS selection unlocks Delete. Older backups are for restoring.
  const [backup, setBackup] = useState<Backup | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [restoreId, setRestoreId] = useState<string>(overview.backups[0]?.id ?? '');
  const [confirmRestore, setConfirmRestore] = useState('');

  const run = (fn: () => Promise<void>) => start(async () => { setMessage(null); await fn(); });

  const reset = () => { setPreview(null); setAccepted(false); setBackup(null); setConfirmDelete(''); };

  const choose = (ids: string[]) => {
    reset();
    setSelected(ids);
    if (ids.length === 0) return;
    run(async () => {
      const r = await previewDeleteAction(ids);
      if (!r.ok) return setMessage({ ok: false, text: r.detail });
      setPreview({ groups: r.groups, tree: r.tree });
    });
  };

  const cancel = () => { reset(); setSelected([]); };

  const takeBackup = () => run(async () => {
    const r = await createBackupAction(selected);
    if (!r.ok) return setMessage({ ok: false, text: r.detail });
    setBackup(r.backup);
    setRestoreId(r.backup.id);
    // Browsers block a second download fired in the same tick, so space them out (R2-390).
    const backupId = r.backup.id;
    const clickDownload = (kind: 'json' | 'csv') => {
      const link = document.createElement('a');
      link.href = downloadUrl(backupId, kind);
      link.download = '';
      link.click();
    };
    clickDownload('json');
    setTimeout(() => clickDownload('csv'), DOWNLOAD_GAP_MS);
    setMessage({ ok: true, text: 'Backup saved. Two files are downloading (JSON and CSV). If your browser asks, allow multiple downloads.' });
  });

  const remove = () => run(async () => {
    if (!backup) return;
    const r = await deleteDataAction(selected, backup.id, confirmDelete);
    if (!r.ok) return setMessage({ ok: false, text: r.detail });
    cancel();
    setMessage({ ok: true, text: `Deleted ${r.rowsDeleted} records. Your backup is kept, so you can restore it.` });
  });

  const restore = () => run(async () => {
    const r = await restoreBackupAction(restoreId, confirmRestore);
    if (!r.ok) return setMessage({ ok: false, text: r.detail });
    setConfirmRestore('');
    setMessage({ ok: true, text: `Restored ${r.rowsRestored} records and ${r.linksRestored} links. Nothing existing was overwritten.` });
  });

  if (!entered) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold text-red-700">Danger Zone</h1>
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          This screen permanently deletes live business data for everyone. Continue only if you mean to clear data.
        </p>
        <button className={`${btn} self-start bg-red-700 text-white`} onClick={() => setEntered(true)}>I understand, continue</button>
      </div>
    );
  }

  const names = overview.groups.filter((g) => selected.includes(g.id)).map((g) => g.label).join(', ');
  const roots = preview?.tree.filter((t) => t.depth === 0).length ?? 0;
  const dependents = (preview?.tree.length ?? 0) - roots;
  const allIds = overview.groups.map((g) => g.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="text-xl font-semibold text-red-700">Danger Zone</h1>
      <p className="text-sm text-slate-600">
        Only the Owner sees this. Logins, Owner and Admin accounts, settings and the audit log are never deleted.
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

      <section className="rounded-2xl border border-red-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Step 1. Choose what to delete</h2>
        <div className="mt-2 flex flex-col gap-2">
          {overview.groups.map((g) => (
            <label key={g.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
              <input
                type="checkbox"
                className="mt-1"
                disabled={pending}
                checked={selected.includes(g.id)}
                onChange={() => choose(selected.includes(g.id) ? selected.filter((x) => x !== g.id) : [...selected, g.id])}
              />
              <span>
                <span className="font-medium text-slate-900">{g.label} <span className="text-slate-400">({g.rows} records)</span></span>
                <span className="block text-xs text-slate-500">{g.description}</span>
              </span>
            </label>
          ))}
        </div>
        <button className={`${btn} mt-3 bg-slate-100 text-slate-900`} disabled={pending} onClick={() => choose(allIds)}>Clear everything</button>

        {preview && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-800">This will permanently remove:</p>
            <ul className="mt-1 text-sm text-red-900">
              {preview.tree.map((t) => (
                <li key={t.name} style={{ paddingLeft: `${t.depth}rem` }}>{t.depth > 0 ? '└ ' : ''}{tableLabel(t.name)}: {t.rows}</li>
              ))}
            </ul>
            {preview.tree.some((t) => t.name === 'mis_inventory_ledger') && (
              <p className="mt-2 text-sm text-red-800">
                Stock will read 0 for every item: the whole stock ledger and store transactions go, not only the rows of what you chose.
              </p>
            )}
            {dependents > 0 && (
              <p className="mt-2 text-sm text-red-800">
                {names} cannot be cleared alone: {dependents} other kinds of data depend on it, and leaving them would break their links.
              </p>
            )}
            {!accepted && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={`${btn} bg-red-700 text-white`} onClick={() => setAccepted(true)}>Delete {names} + ALL related data</button>
                <button className={`${btn} bg-white text-slate-700`} onClick={cancel}>Cancel</button>
              </div>
            )}
          </div>
        )}
      </section>

      {accepted && (
        <section className="rounded-2xl border border-red-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Step 2. Back up (required)</h2>
          {!backup && (
            <>
              <p className="mt-1 text-sm text-slate-600">Delete stays off until this backup is saved, read back and its checksums match.</p>
              <button className={`${btn} mt-3 bg-slate-900 text-white`} disabled={pending || !overview.storageOk} onClick={takeBackup}>
                {pending ? 'Working…' : 'Take backup now'}
              </button>
            </>
          )}
          {backup && (
            <>
              <p className="mt-1 text-sm text-green-800">Backup saved and checksums verified ({backup.totalRows} records). Keep the downloaded copies.</p>
              <p className="mt-1 text-sm">
                <a className="underline" href={downloadUrl(backup.id, 'json')}>{backup.name}.json</a>
                {' · '}
                <a className="underline" href={downloadUrl(backup.id, 'csv')}>{backup.name}.csv.zip</a>
              </p>
              <h2 className="mt-4 font-semibold text-slate-900">Step 3. Confirm</h2>
              <label className="mt-1 block text-sm text-slate-700">
                Type {CONFIRM_DELETE_WORD} to confirm
                <input className={field} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} autoComplete="off" />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={`${btn} bg-red-700 text-white`} disabled={pending || confirmDelete !== CONFIRM_DELETE_WORD || !overview.storageOk} onClick={remove}>Delete now</button>
                <button className={`${btn} bg-white text-slate-700`} onClick={cancel}>Cancel</button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Restore a backup</h2>
        <p className="mt-1 text-sm text-slate-600">Puts back anything that is missing. It never overwrites or removes what is already there.</p>
        <select aria-label="Backup to restore" className={field} value={restoreId} onChange={(e) => setRestoreId(e.target.value)}>
          {overview.backups.length === 0 && !backup && <option value="">No backups yet</option>}
          {backup && <option value={backup.id}>{new Date(backup.createdAt).toLocaleString()} ({backup.totalRows} records)</option>}
          {overview.backups.filter((b) => b.id !== backup?.id).map((b) => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleString()} ({b.totalRows} records)</option>)}
        </select>
        <label className="mt-3 block text-sm text-slate-700">
          Type {CONFIRM_RESTORE_WORD} to confirm
          <input className={field} value={confirmRestore} onChange={(e) => setConfirmRestore(e.target.value)} autoComplete="off" />
        </label>
        <button className={`${btn} mt-3 bg-slate-900 text-white`} disabled={pending || !restoreId || confirmRestore !== CONFIRM_RESTORE_WORD} onClick={restore}>
          Restore backup
        </button>
      </section>
    </div>
  );
}
