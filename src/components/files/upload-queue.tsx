'use client';

import { memo } from 'react';
import { CheckCircle2, AlertCircle, Loader2, X, RotateCcw, Upload } from 'lucide-react';
import { formatBytes } from '@/lib/file-utils';

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  progress?: number;
};

export function UploadQueue({
  items,
  onRetry,
  onCancel,
  onDismiss,
}: {
  items: UploadItem[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: () => void;
}) {
  if (items.length === 0) return null;

  const done = items.filter((i) => i.status === 'success').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const inProgress = items.some((i) => i.status === 'uploading' || i.status === 'pending');

  const totalBytes = items.reduce((s, i) => s + Math.max(i.size, 1), 0);
  const uploadedBytes = items.reduce((s, i) => {
    if (i.status === 'success') return s + Math.max(i.size, 1);
    if (i.status === 'uploading') return s + (Math.max(i.size, 1) * (i.progress ?? 0)) / 100;
    return s;
  }, 0);
  const overallPercent = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  return (
    <div
      className="fixed inset-x-3 z-[60] mx-auto max-w-lg animate-in slide-up-fade duration-300 sm:inset-x-auto sm:right-4 sm:left-auto"
      style={{
        bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
      }}
      role="region"
      aria-label="Upload queue"
    >
      <div className="overflow-hidden rounded-2xl border border-border/55 bg-card/98 shadow-float backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            {inProgress ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                <span className="truncate text-sm font-semibold">
                  Uploading {done}/{items.length} · {overallPercent}%
                </span>
              </>
            ) : failed > 0 ? (
              <>
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <span className="text-sm font-semibold">
                  {done} done · {failed} failed
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-sm font-semibold">{done} uploaded</span>
              </>
            )}
          </div>
          {!inProgress && (
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 rounded-lg p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
              aria-label="Dismiss upload queue"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="h-1 bg-muted/25">
          <div
            className={`h-full transition-all duration-300 ease-out ${
              failed > 0 && !inProgress ? 'bg-destructive/70' : 'bg-primary'
            }`}
            style={{
              width: `${inProgress ? overallPercent : done === items.length ? 100 : overallPercent}%`,
            }}
          />
        </div>

        <div className="max-h-[min(40vh,14rem)] overflow-y-auto overscroll-contain">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} onRetry={onRetry} onCancel={onCancel} />
          ))}
        </div>
      </div>
    </div>
  );
}

const UploadRow = memo(function UploadRow({
  item,
  onRetry,
  onCancel,
}: {
  item: UploadItem;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 border-b border-border/35 px-3 py-2.5 last:border-0 sm:gap-3 sm:px-4 sm:py-3 ${
        item.status === 'error'
          ? 'bg-destructive/5'
          : item.status === 'success'
            ? 'bg-emerald-500/5'
            : item.status === 'uploading'
              ? 'bg-primary/4'
              : ''
      }`}
    >
      <StatusIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium sm:text-[13px]" title={item.name}>
          {item.name}
        </p>
        {item.status === 'error' ? (
          <p className="mt-0.5 line-clamp-3 text-[10px] leading-snug text-destructive/90 sm:line-clamp-2">
            {item.error ?? 'Upload failed'}
          </p>
        ) : (
          <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/70">
            {item.size > 0 ? formatBytes(item.size) : 'Size unknown'}
            {item.status === 'uploading' && ` · ${item.progress ?? 0}%`}
            {item.status === 'pending' && ' · Waiting'}
            {item.status === 'success' && ' · Done'}
          </p>
        )}
        {item.status === 'uploading' && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/30">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{ width: `${item.progress ?? 0}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
        {item.status === 'error' && (
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            className="rounded-lg p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
            title="Retry"
            aria-label={`Retry ${item.name}`}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        {(item.status === 'pending' || item.status === 'uploading' || item.status === 'error') && (
          <button
            type="button"
            onClick={() => onCancel(item.id)}
            className="rounded-lg p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
            title="Cancel"
            aria-label={`Cancel ${item.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {item.status === 'success' && (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        )}
      </div>
    </div>
  );
});

function StatusIcon({ status }: { status: UploadItem['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40 ring-1 ring-border/40">
          <Upload className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
      );
    case 'uploading':
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        </div>
      );
    case 'success':
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        </div>
      );
    case 'error':
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        </div>
      );
  }
}
