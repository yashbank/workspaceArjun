'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { filterComboOptions, type ComboOption } from '@/lib/mis/combobox-filter';

export type { ComboOption };

export type ComboboxProps = {
  /** Already translated by the caller. */
  label: string;
  value: string | null;
  options: ComboOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string | null;
  /** Allow clearing back to empty (adds a "none" row). */
  clearable?: boolean;
  /** Use an externally rendered <label htmlFor=id>; the built-in label becomes screen-reader only. */
  id?: string;
  hideLabel?: boolean;
};

/**
 * Searchable single-select (R2-82). Type to filter, arrow keys + Enter to pick, Escape to close.
 * Touch targets are 44px+. One component for Items, Units, Machines, Operators and Orders.
 */
export function Combobox({ label, value, options, onChange, placeholder = 'Type to search…', disabled, error, clearable, id: idProp, hideLabel }: ComboboxProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const listId = `${id}-list`;
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const visible = useMemo(() => filterComboOptions(options, query), [options, query]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (visible[active]) pick(visible[active].value); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div ref={root} className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-slate-700'}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={error ? true : undefined}
        aria-activedescendant={open && visible[active] ? `${id}-o${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : selected?.label ?? ''}
        placeholder={selected ? selected.label : placeholder}
        onFocus={() => { setOpen(true); setActive(0); }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={onKey}
        className={cn(
          'min-h-12 w-full rounded-lg border bg-white px-3 text-base text-slate-900 placeholder:text-slate-500',
          error ? 'border-red-500' : 'border-slate-300',
          'focus:outline-2 focus:outline-slate-900 disabled:bg-slate-50',
        )}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {clearable && (
            <li role="option" aria-selected={!value} onMouseDown={(e) => { e.preventDefault(); pick(''); }} className="min-h-11 cursor-pointer px-3 py-2.5 text-base text-slate-500 hover:bg-slate-50">None</li>
          )}
          {visible.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
              className={cn('min-h-11 cursor-pointer px-3 py-2.5 text-base text-slate-900', i === active && 'bg-slate-100', o.value === value && 'font-semibold')}
            >
              {o.label}
              {o.hint && <span className="ml-2 text-sm text-slate-500">{o.hint}</span>}
            </li>
          ))}
          {visible.length === 0 && <li className="px-3 py-3 text-base text-slate-500">No matches</li>}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
