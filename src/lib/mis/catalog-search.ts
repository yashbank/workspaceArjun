/**
 * R2-10 — the searchable catalog-item picker on a BOM material. Pure: no Prisma, no React.
 *
 * Every word of the query must appear in the item's code or name (case-insensitive), so "kraft 120"
 * finds "Kraft Liner 120 GSM". A blank query lists nothing (the picker asks for a search rather
 * than dumping the whole catalog). Exact code matches come first, then by name.
 */
export type CatalogItem = { id: string; code: string; name: string; unit: string };

export const CATALOG_PICKER_LIMIT = 8;

export function searchCatalog<T extends CatalogItem>(items: readonly T[], query: string, limit = CATALOG_PICKER_LIMIT): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const q = query.trim().toLowerCase();
  return items
    .filter((it) => {
      const hay = `${it.code} ${it.name}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => Number(b.code.toLowerCase() === q) - Number(a.code.toLowerCase() === q) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** "KR-120 · Kraft Liner 120 GSM (KG)" — how a picked item reads. */
export function catalogLabel(it: CatalogItem): string {
  return `${it.code} · ${it.name} (${it.unit})`;
}
