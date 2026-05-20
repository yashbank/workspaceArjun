'use client';

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

  const totalBytes = items.reduce((s, i) => s + i.size, 0);
  const uploadedBytes = items.reduce((s, i) => {
    if (i.status === 'success') return s + i.size;
    if (i.status === 'uploading') return s + (i.size * (i.progress ?? 0)) / 100;
    return s;
  }, 0);
  const overallPercent = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-float backdrop-blur-xl animate-in slide-up-fade duration-300 sm:left-auto sm:right-6 sm:translate-x-0">
      <div className="flex items-center justify-between border-b border-border/20 px-4 py-3">
        <div className="flex items-center gap-2.5">
          {inProgress ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-semibold">
                Uploading {done}/{items.length} · {overallPercent}%
              </span>
            </>
          ) : failed > 0 ? (
            <>
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-semibold">
                {done} done, {failed} failed
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold">{done} uploaded</span>
            </>
          )}
        </div>
        {!inProgress && (
          <button
            onClick={onDismiss}
            className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="h-[2px] bg-muted/20">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${inProgress ? overallPercent : done === items.length ? 100 : overallPercent}%` }}
        />
      </div>

      <div className="max-h-52 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-0 transition-all ${
              item.status === 'error'
                ? 'bg-destructive/5'
                : item.status === 'success'
                  ? 'bg-emerald-500/5'
                  : item.status === 'uploading'
                    ? 'bg-primary/3'
                    : ''
            }`}
          >
            <StatusIcon status={item.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{item.name}</p>
              {item.status === 'error' ? (
                <p className="mt-0.5 truncate text-[10px] text-destructive/80">
                  {item.error ?? 'Failed'}
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {formatBytes(item.size)}
                  {item.status === 'uploading' && ` · ${item.progress ?? 0}%`}
                </p>
              )}
              {item.status === 'uploading' && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${item.progress ?? 0}%` }}
                  />
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {item.status === 'error' && (
                <button
                  onClick={() => onRetry(item.id)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
                  title="Retry"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              {(item.status === 'pending' || item.status === 'uploading' || item.status === 'error') && (
                <button
                  onClick={() => onCancel(item.id)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
                  title="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {item.status === 'success' && (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: UploadItem['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-muted/40">
          <Upload className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
      );
    case 'uploading':
      return (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        </div>
      );
    case 'success':
      return (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        </div>
      );
    case 'error':
      return (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        </div>
      );
  }
}
