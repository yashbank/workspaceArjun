'use client';

import { AlertTriangle } from 'lucide-react';

export type DuplicateAction = 'keep-both' | 'overwrite' | 'new-version' | 'cancel';

export function DuplicateDialog({
  fileName,
  existingFileId: _existingFileId,
  remainingCount = 0,
  onAction,
}: {
  fileName: string;
  existingFileId: string;
  remainingCount?: number;
  onAction: (action: DuplicateAction) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200">
        <div className="flex items-start gap-3 border-b border-border/30 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight">File already exists</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">
              <span className="font-medium text-foreground/70">&ldquo;{fileName}&rdquo;</span> already exists in this folder.
            </p>
            {remainingCount > 0 && (
              <p className="mt-1 text-[10px] font-medium text-amber-600/80 dark:text-amber-400/80">
                {remainingCount} more duplicate{remainingCount > 1 ? 's' : ''} to review
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5 p-4">
          <ActionButton
            label="Keep both"
            description="Upload as a separate copy (renamed)"
            onClick={() => onAction('keep-both')}
          />
          <ActionButton
            label="Upload as new version"
            description="Add as the latest version; keeps full version history"
            onClick={() => onAction('new-version')}
            primary
          />
          <ActionButton
            label="Replace current file"
            description="Make this the current file (previous version kept in history)"
            onClick={() => onAction('overwrite')}
            destructive
          />
        </div>

        <div className="border-t border-border/30 px-5 py-3">
          <div className="flex justify-end">
            <button
              onClick={() => onAction('cancel')}
              className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  description,
  onClick,
  primary,
  destructive,
}: {
  label: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col items-start rounded-xl border px-4 py-3 text-left transition-all active:scale-[0.99] ${
        primary
          ? 'border-primary/20 bg-primary/4 hover:bg-primary/8 hover:shadow-card'
          : destructive
            ? 'border-destructive/15 hover:bg-destructive/4 hover:shadow-card'
            : 'border-border/40 hover:bg-accent/30 hover:shadow-card'
      }`}
    >
      <span className={`text-xs font-semibold ${destructive ? 'text-destructive' : ''}`}>{label}</span>
      <span className="text-[11px] text-muted-foreground/60">{description}</span>
    </button>
  );
}
