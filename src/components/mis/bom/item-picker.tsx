'use client';
import { useId, useState } from 'react';

import { catalogLabel, searchCatalog, type CatalogItem } from '@/lib/mis/catalog-search';

/**
 * R2-10 — link a BOM material to a catalog item: type to search code or name, tap a result.
 * `value` is the linked item id (null = not linked). "Unlink" clears it. Presentation only: the
 * server re-checks the item exists and is active.
 */
export function ItemPicker({
  items,
  value,
  onChange,
}: {
  items: CatalogItem[];
  value: string | null;
  onChange: (item: CatalogItem | null) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const picked = value ? (items.find((i) => i.id === value) ?? null) : null;
  const results = searchCatalog(items, query);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        Catalog item (optional)
      </label>
      {picked && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
          <span data-testid="picked-item" className="truncate">{catalogLabel(picked)}</span>
          <button type="button" onClick={() => onChange(null)} className="min-h-11 px-2 text-sm font-medium text-indigo-700">
            Unlink
          </button>
        </div>
      )}
      <input
        id={id}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by code or name"
        className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900"
      />
      {query.trim() !== '' && (
        <ul role="listbox" aria-label="Matching items" className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">No item matches.</li>
          ) : (
            results.map((it) => (
              <li key={it.id} role="option" aria-selected={it.id === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(it);
                    setQuery('');
                  }}
                  className="flex min-h-11 w-full items-center px-3 text-left text-sm text-slate-800 hover:bg-slate-50"
                >
                  {catalogLabel(it)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
