'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
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
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
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

  // Close on outside pointer / Escape. The listener is registered in an effect,
  // i.e. AFTER the render that opened the menu, so the gesture that opened it is
  // never caught (no rAF/pointer-events hack needed). Pointers inside the menu
  // or on the trigger/anchor are ignored — so the trigger keeps its own toggle,
  // and clicking another row's trigger closes this menu AND opens that one in a
  // single click (the underlying click is never swallowed by a backdrop).
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[601] overflow-hidden rounded-xl border border-border/55 bg-popover p-1 shadow-float animate-in scale-in fade-in duration-100"
      style={{ top: pos.top, left: pos.left, width }}
    >
      {children}
    </div>,
    document.body,
  );
}
