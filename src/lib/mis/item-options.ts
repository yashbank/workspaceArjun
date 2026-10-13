/** Pure option helpers for the item forms (R3-MST B32). No Prisma, no React. */

export type OptionLike = { value: string; label: string };

/** The unit values the database enum accepts today; the enum becomes text in R3-S2. */
export const LEGACY_UNITS = ['KG', 'LITRE', 'PIECE', 'REAM'] as const;

const LEGACY_LABELS: Record<string, string> = { KG: 'Kg', LITRE: 'Litre', PIECE: 'Piece', REAM: 'Ream' };

/**
 * The unit dropdown: only master options whose value is one the enum can store. If the master has
 * none of them, the legacy values are offered with readable labels.
 */
export function unitChoices(options: readonly OptionLike[], legacyUnits: readonly string[] = LEGACY_UNITS): OptionLike[] {
  const allowed = new Set(legacyUnits);
  const picked = options.filter((o) => allowed.has(o.value));
  if (picked.length > 0) return picked.map((o) => ({ value: o.value, label: o.label }));
  return legacyUnits.map((u) => ({ value: u, label: LEGACY_LABELS[u] ?? u }));
}

/**
 * GSM / Size dropdowns store the option LABEL. A stored value that is not among the labels stays
 * selectable as an extra "<value> (not in masters)" entry so an old item can still be edited.
 */
export function labelChoices(options: readonly OptionLike[], current: string | null | undefined): OptionLike[] {
  const list = options.map((o) => ({ value: o.label, label: o.label }));
  const cur = (current ?? '').trim();
  if (cur && !list.some((o) => o.value === cur)) list.push({ value: cur, label: `${cur} (not in masters)` });
  return list;
}
