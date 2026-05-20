'use client';

import { AlertCircle, Loader2, Trash2 } from 'lucide-react';

export function RemoveUserModal({
  email,
  displayName,
  busy,
  onConfirm,
  onCancel,
}: {
  email: string;
  displayName: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float"
        role="dialog"
        aria-labelledby="remove-user-title"
      >
        <div className="flex items-start gap-3 border-b border-destructive/15 bg-destructive/5 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
            <Trash2 className="h-4 w-4 text-destructive" />
          </div>
          <div className="min-w-0">
            <h2 id="remove-user-title" className="text-sm font-bold tracking-tight text-destructive">
              Remove permanently
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {displayName} · {email}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-5 text-sm leading-relaxed text-foreground/90">
          <p>
            This permanently removes <strong>{displayName}</strong> from the workspace and deletes their
            Supabase Auth login. They will not be able to sign in again unless you invite them again.
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>Pending invites for this email will be cancelled</li>
            <li>Activity stars and notifications for this user will be removed</li>
            <li>Uploaded file metadata will be reassigned to the owner</li>
          </ul>
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This action cannot be undone. The user must be deactivated first and must not own any
            active files or folders.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/30 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-xs font-semibold text-destructive-foreground shadow-card transition-all hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Remove permanently
          </button>
        </div>
      </div>
    </div>
  );
}
