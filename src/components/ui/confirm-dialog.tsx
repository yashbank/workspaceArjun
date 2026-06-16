'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingConfirm = { opts: ConfirmOptions; resolve: (ok: boolean) => void };

/**
 * Promise-based confirmation that renders a styled, NON-BLOCKING modal — a drop-in
 * async replacement for `window.confirm()`. Native confirm()/alert() block the
 * main thread for the entire time the dialog is open, and the browser's Event
 * Timing API counts that block as interaction processing time, which inflates INP
 * (a delete click sat on confirm() reads as a ~1s "slow" interaction). This yields
 * to the event loop instead, so the triggering interaction paints immediately.
 *
 * The scrim is a plain translucent layer — deliberately NOT `backdrop-blur`. A
 * full-viewport backdrop filter forces the browser to rasterize a blurred copy
 * of the entire (thumbnail-heavy) page on the dialog's first paint, which is the
 * long task that shows up as a high-INP "Event handlers blocked UI updates" on
 * the delete button. Keep it blur-free.
 *
 * Usage:
 *   const { confirm, confirmDialog } = useConfirm();
 *   // in JSX: {confirmDialog}
 *   if (!(await confirm({ title, message, destructive: true }))) return;
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setPending({ opts, resolve }));
  }, []);

  const settle = useCallback((ok: boolean) => {
    setPending((p) => {
      if (p) p.resolve(ok);
      return null;
    });
  }, []);

  const confirmDialog = pending ? (
    <ConfirmDialog opts={pending.opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;

  return { confirm, confirmDialog };
}

function ConfirmDialog({
  opts,
  onConfirm,
  onCancel,
}: {
  opts: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 animate-in fade-in duration-150"
      onMouseDown={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 py-4">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
              opts.destructive ? 'bg-destructive/10' : 'bg-primary/8'
            }`}
          >
            <AlertTriangle className={`h-4 w-4 ${opts.destructive ? 'text-destructive' : 'text-primary'}`} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight">{opts.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{opts.message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]"
          >
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2.5 text-xs font-semibold shadow-card transition-all hover:shadow-elevated active:scale-[0.97] ${
              opts.destructive
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {opts.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
