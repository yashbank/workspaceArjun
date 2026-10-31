'use client';
import { useId, useMemo } from 'react';

import { Combobox } from '@/components/ui/combobox';
import { catalogLabel, type CatalogItem } from '@/lib/mis/catalog-search';

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
  const options = useMemo(() => items.map((i) => ({ value: i.id, label: catalogLabel(i) })), [items]);
  const picked = value ? (items.find((i) => i.id === value) ?? null) : null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700">Catalog item (optional)</span>
      {picked && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
          <span data-testid="picked-item" className="truncate">{catalogLabel(picked)}</span>
          <button type="button" onClick={() => onChange(null)} className="min-h-11 px-2 text-sm font-medium text-indigo-700">
            Unlink
          </button>
        </div>
      )}
      <Combobox
        id={id}
        label="Catalog item (optional)"
        hideLabel
        value={value}
        options={options}
        placeholder="Search by code or name"
        onChange={(v) => {
          const it = items.find((i) => i.id === v);
          if (it) onChange(it);
        }}
      />
    </div>
  );
}
