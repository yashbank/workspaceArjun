'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type FixedMenuProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: 'left' | 'right';
  width?: number;
  estimatedHeight?: number;
};

export function FixedMenu({
  open,
  onClose,
  anchorRef,
  children,
  align = 'right',
  width = 192,
  estimatedHeight = 220,
}: FixedMenuProps) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuH = menuRef.current?.offsetHeight ?? estimatedHeight;
      const gap = 6;

      let top = rect.bottom + gap;
      if (top + menuH > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuH - gap);
      }

      let left = align === 'right' ? rect.right - width : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

      setPos({ top, left });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, anchorRef, align, width, estimatedHeight]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[500]" onClick={onClose} aria-hidden />
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[501] overflow-hidden rounded-xl border border-border/55 bg-popover p-1 shadow-float animate-in scale-in fade-in duration-100"
        style={{ top: pos.top, left: pos.left, width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
