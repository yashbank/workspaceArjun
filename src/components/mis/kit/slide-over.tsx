'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';

import { useT } from '../shell/locale-provider';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type SlideOverProps = {
  open: boolean;
  /** Already translated by the caller. */
  title: string;
  onClose: () => void;
  /** When true, closing asks for confirmation first. */
  dirty?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * The standard create/edit surface.
 *
 * Slides from the right on desktop and up from the bottom on a phone, so the
 * form lands under the thumb rather than under the notch.
 */
export function SlideOver({ open, title, onClose, dirty = false, children, footer }: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useT();

  /**
   * Closing a half-filled form by accident is the single most annoying thing a
   * form can do, so a dirty panel asks first.
   */
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm(t('common.unsavedChanges'))) return;
    onClose();
  }, [dirty, onClose, t]);

  // Escape closes; Tab is trapped inside the panel so focus cannot wander to
  // the page behind, which a screen reader would otherwise read straight into.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, requestClose]);

  // Move focus into the panel on open, and hand it back to the page on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label={t('action.close')}
            className="min-h-11 min-w-11 rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100"
          >
            &times;
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer && (
          <footer className="border-t border-slate-200 px-4 py-3">{footer}</footer>
        )}
      </div>
    </div>
  );
}
