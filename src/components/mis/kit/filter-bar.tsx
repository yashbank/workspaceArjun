'use client';

import type { ReactNode } from 'react';

import { SearchInput } from './search-input';

export type FilterBarProps = {
  searchLabel: string;
  query: string;
  onQuery: (q: string) => void;
  /** Dropdowns / chips, already rendered by the caller. */
  children?: ReactNode;
};

/** Shared list toolbar: debounced search on the left, filters wrapping beside it. T2 builds every list on this. */
export function FilterBar({ searchLabel, query, onQuery, children }: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-0 sm:max-w-sm sm:flex-1">
        <SearchInput label={searchLabel} value={query} onSearch={onQuery} />
      </div>
      {children}
    </div>
  );
}
