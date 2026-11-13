'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { filterComboOptions, type ComboOption } from '@/lib/mis/combobox-filter';
import { Command, CommandItem, CommandList } from './command';
import { Popover, PopoverAnchor, PopoverContent } from './popover';

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

/** The None row's cmdk value and highlight key; `value` for it is empty. */
const NONE = '__none';
/** Told to cmdk when no row is highlighted: an empty value would make it highlight the first row itself. */
const NO_ROW = '__no_row';

/**
 * Searchable single-select (R2-82), built on shadcn Command (cmdk) + Popover. Type to filter, arrow keys + Enter to pick,
 * Escape or Tab to close. Our own `filterComboOptions` filters (cmdk's is off), so the matching rules are unchanged. Touch
 * targets are 44px+, the field 48px with 16px text. cmdk draws the rows, but the keys are handled here: it finds its
 * active row by aria-selected="true", which must mark the chosen row, and only this component knows the query.
 */
export function Combobox({ label, value, options, onChange, placeholder = 'Type to search…', disabled, error, clearable, id: idProp, hideLabel }: ComboboxProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const anchor = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState('');
  const [list, setList] = useState<HTMLElement | null>(null);
  const [modal, setModal] = useState<Element | null>(null);

  const visible = useMemo(() => filterComboOptions(options, query), [options, query]);
  // What the keys walk. While searching that is the matches alone, so Enter can never land on None and blank the value.
  const rows = useMemo(() => [...(clearable && !query ? [NONE] : []), ...visible.map((o) => o.value)], [clearable, query, visible]);
  const chosen = value || NONE;
  const active = rows.includes(picked) ? picked : !query && rows.includes(chosen) ? chosen : rows[0];
  const activeId = active === undefined ? undefined : active === NONE ? `${id}-none` : `${id}-o${visible.findIndex((o) => o.value === active)}`;

  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeId]);

  // R2-387: on touch the input can blur before the synthesised mousedown of a tap. A pointerdown inside the list marks
  // "a row is being pressed", and the blur that follows leaves the list open so the tap's click can select.
  const pressing = useRef(false);
  const close = () => { setOpen(false); setQuery(''); setPicked(''); };
  const pick = (v: string) => { onChange(v); close(); };
  // Rows act on mousedown (not click) with preventDefault, so the input keeps focus and never blurs first (R2-354).
  const press = (v: string) => (e: React.MouseEvent) => { e.preventDefault(); pick(v); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') close();
    // A preventDefault also keeps an event out of cmdk's root handler; Home and End must reach the field, so they stop here.
    else if (e.key === 'Home' || e.key === 'End') e.stopPropagation();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (active !== undefined) setPicked(rows[(rows.indexOf(active) + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]);
    } else if (e.key === 'Enter') {
      // On a closed list it stays out of cmdk, which would swallow it: the field's form must still submit.
      if (!open) e.stopPropagation();
      else {
        e.preventDefault();
        if (active !== undefined) pick(active === NONE ? '' : active);
      }
    }
  };

  return (
    // cmdk always renders its own label, for an input of its own this field does not use: `hidden` keeps it out of the reading order.
    <Command shouldFilter={false} vimBindings={false} disablePointerSelection value={active ?? NO_ROW} className="relative flex flex-col gap-1.5 [&>[cmdk-label]]:hidden">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-slate-700'}>{label}</label>
      <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <PopoverAnchor asChild>
          <div ref={anchor}>
            <input
              id={id}
              role="combobox"
              aria-expanded={open}
              aria-controls={list?.id}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-activedescendant={open ? activeId : undefined}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
              disabled={disabled}
              value={open ? query : selected?.label ?? ''}
              onChange={(e) => { setQuery(e.target.value); setPicked(''); setOpen(true); }}
              placeholder={selected ? selected.label : placeholder}
              onFocus={(e) => { setModal(e.target.closest('[aria-modal="true"]')); setOpen(true); }}
              onClick={() => setOpen(true)}
              // R2-354: Tab (or any focus move) closes the list; the rows never take focus.
              onBlur={() => { if (!pressing.current) close(); }}
              onKeyDown={onKey}
              className={cn(
                'min-h-12 w-full rounded-lg border bg-white px-3 text-base text-slate-900 placeholder:text-slate-500',
                error ? 'border-red-500' : 'border-slate-300',
                'focus:outline-2 focus:outline-slate-900 disabled:bg-slate-50',
              )}
            />
          </div>
        </PopoverAnchor>
        {open && (
          <PopoverContent
            // Outside an aria-modal panel a screen reader treats the list as inert. It is position: fixed, so the panel does not clip it.
            container={modal}
            // Radix calls this a dialog; here it only holds the listbox.
            role="presentation"
            onPointerDown={() => { pressing.current = true; setTimeout(() => { pressing.current = false; }, 600); }}
            className="w-(--radix-popover-trigger-width) p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            // The field itself is "outside" the popover; clicking it must not close the list.
            onInteractOutside={(e) => { if (anchor.current?.contains(e.target as Node)) e.preventDefault(); }}
          >
            <CommandList ref={setList} label={label}>
              {clearable && (
                <CommandItem asChild value={NONE} onMouseDown={press('')} onSelect={() => pick('')} className="text-slate-500">
                  <div id={`${id}-none`} aria-selected={!value}>None</div>
                </CommandItem>
              )}
              {visible.map((o, i) => (
                <CommandItem
                  asChild
                  key={o.value}
                  value={o.value}
                  onMouseDown={press(o.value)}
                  onSelect={() => pick(o.value)}
                  className={cn(o.value === value && 'font-semibold')}
                >
                  <div id={`${id}-o${i}`} aria-selected={o.value === value}>
                    {o.label}
                    {o.hint && <span className="ml-2 text-sm text-slate-500">{o.hint}</span>}
                  </div>
                </CommandItem>
              ))}
              {visible.length === 0 && <div className="px-3 py-3 text-base text-slate-500">No matches</div>}
            </CommandList>
          </PopoverContent>
        )}
      </Popover>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </Command>
  );
}
