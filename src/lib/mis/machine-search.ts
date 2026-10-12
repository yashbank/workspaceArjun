/**
 * Client-side machine-name search for the Day Timeline tab (C6b #20). Case-insensitive substring on the name, so
 * "polar" finds "Polar 115 Cutter"; an empty or blank query matches everything. Pure.
 */
export function filterByMachineName<T extends { name: string }>(rows: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) => row.name.toLowerCase().includes(q));
}
