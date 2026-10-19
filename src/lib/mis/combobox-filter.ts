/** Pure filter for the searchable Combobox (R2-82). Case-insensitive, every typed word must appear in the label. */
export type ComboOption = { value: string; label: string; hint?: string };

export function filterComboOptions<T extends ComboOption>(options: readonly T[], query: string, limit = 100): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return options.slice(0, limit);
  return options
    .filter((o) => {
      const hay = `${o.label} ${o.hint ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}
