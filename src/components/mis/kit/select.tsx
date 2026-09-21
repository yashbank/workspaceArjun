'use client';

import { useId, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { useT } from '../shell/locale-provider';

export type SelectOption = { value: string; label: string };

/** Above this many options a bare <select> stops being usable on a phone. */
const SEARCH_THRESHOLD = 8;

export type SelectProps = {
  /** Already translated by the caller. */
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
  /**
   * Inline "+ Add option". Given the typed text, persists the new option and
   * returns its value so the field can select it without losing the form (S3).
   */
  onAddOption?: (label: string) => Promise<string>;
};

export function Select({
  label,
  value,
  options,
  onChange,
  error,
  disabled,
  placeholder,
  onAddOption,
}: SelectProps) {
  const id = useId();
  const t = useT();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const searchable = options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    if (!searchable || query.trim() === '') return options;
    const needle = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, query, searchable]);

  const canAdd =
    typeof onAddOption === 'function' &&
    query.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  async function handleAdd() {
    if (!onAddOption || adding) return;
    setAdding(true);
    try {
      const newValue = await onAddOption(query.trim());
      onChange(newValue);
      setQuery('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>

      {searchable && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('action.search')}
          disabled={disabled}
          // Named after its field: a form full of dropdowns would otherwise
          // present several identical "Search" boxes with nothing to tell them
          // apart, by voice or by screen reader.
          aria-label={label + ': ' + t('action.search')}
          className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
        />
      )}

      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'min-h-12 w-full rounded-lg border bg-white px-3 text-base text-slate-900',
          error ? 'border-red-500' : 'border-slate-300',
          'focus:outline-2 focus:outline-slate-900 disabled:bg-slate-50',
        )}
      >
        <option value="" disabled>
          {placeholder ?? t('role.select')}
        </option>
        {visible.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {canAdd && (
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="min-h-11 self-start text-base font-medium text-sky-700 hover:underline disabled:text-slate-400"
        >
          {t('action.addOption')}
          {query.trim() ? `: ${query.trim()}` : ''}
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
