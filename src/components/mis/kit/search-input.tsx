'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SearchInputProps = {
  /** Already translated by the caller. */
  label: string;
  /** Initial text; remount via key to reset it from outside. */
  value: string;
  /** Fires `delay` ms after the last keystroke, and immediately on clear. */
  onSearch: (q: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
};

/** The one MIS search box: 48px, 16px text, debounced. Typing is local, so the field never fights a slow server round trip. */
export function SearchInput({ label, value, onSearch, placeholder, delay = 300, className }: SearchInputProps) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (q: string) => {
    setText(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(q), delay);
  };

  return (
    <div className={cn('relative w-full', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
      <input
        type="search"
        aria-label={label}
        value={text}
        placeholder={placeholder ?? label}
        onChange={(e) => change(e.target.value)}
        className="min-h-12 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-11 text-base text-slate-900 transition-shadow placeholder:text-slate-500 focus:outline-2 focus:outline-offset-0 focus:outline-slate-900"
      />
      {text && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          onClick={() => {
            clearTimeout(timer.current);
            setText('');
            onSearch('');
          }}
          className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center text-slate-500 hover:text-slate-900"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
