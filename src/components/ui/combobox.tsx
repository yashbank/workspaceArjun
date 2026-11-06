'use client';

import { useId, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { filterComboOptions, type ComboOption } from '@/lib/mis/combobox-filter';
import { Command, CommandItem, CommandList, useCommandState } from './command';
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

/**
 * Searchable single-select (R2-82), built on shadcn Command (cmdk) + Popover. Type to filter, arrow
 * keys + Enter to pick, Escape or Tab to close. Our own `filterComboOptions` filters (cmdk's is off),
 * so the matching rules are unchanged. Touch targets are 44px+, the field 48px with 16px text.
 */
export function Combobox({ label, value, options, onChange, placeholder = 'Type to search…', disabled, error, clearable, id: idProp, hideLabel }: ComboboxProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const anchor = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => filterComboOptions(options, query), [options, query]);

  const close = () => { setOpen(false); setQuery(''); };
  const pick = (v: string) => { onChange(v); close(); };
  // Rows act on mousedown (not click) with preventDefault, so the input keeps focus and never blurs first (R2-354).
  const press = (v: string) => (e: React.MouseEvent) => { e.preventDefault(); pick(v); };

  return (
    <Command shouldFilter={false} loop className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-slate-700'}>{label}</label>
      <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <PopoverAnchor asChild>
          <div ref={anchor}>
            <ComboInput
              id={id}
              listId={`${id}-pop`}
              open={open}
              aria-invalid={error ? true : undefined}
              disabled={disabled}
              value={open ? query : selected?.label ?? ''}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              placeholder={selected ? selected.label : placeholder}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              // R2-354: Tab (or any focus move) closes the list; the rows never take focus.
              onBlur={close}
              // Enter on a closed list stays out of cmdk, which would swallow it: the field's form must still submit.
              onKeyDown={(e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowDown') setOpen(true); else if (e.key === 'Enter' && !open) e.stopPropagation(); }}
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
            id={`${id}-pop`}
            className="w-(--radix-popover-trigger-width) p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            // The field itself is "outside" the popover; clicking it must not close the list.
            onInteractOutside={(e) => { if (anchor.current?.contains(e.target as Node)) e.preventDefault(); }}
          >
            <CommandList aria-label={label}>
              {clearable && (
                <CommandItem value="__none" onMouseDown={press('')} onSelect={() => pick('')} className="text-slate-500" aria-selected={!value}>None</CommandItem>
              )}
              {visible.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onMouseDown={press(o.value)}
                  onSelect={() => pick(o.value)}
                  className={cn(o.value === value && 'font-semibold')}
                >
                  {o.label}
                  {o.hint && <span className="ml-2 text-sm text-slate-500">{o.hint}</span>}
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

/** The text field. It sits inside <Command>, so cmdk's root handles ArrowUp/Down/Home/End/Enter for it; the active row is announced via aria-activedescendant. */
function ComboInput({ open, listId, ...props }: React.ComponentProps<'input'> & { open: boolean; listId: string }) {
  const active = useCommandState((s) => s.selectedItemId);
  return (
    <input
      {...props}
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-haspopup="listbox"
      aria-autocomplete="list"
      aria-activedescendant={open ? active || undefined : undefined}
      autoComplete="off"
    />
  );
}
