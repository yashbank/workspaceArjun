/** Pure item-code helpers (R3-MST B24). No Prisma, no React. */

const ITEM_CODE_RE = /^ITM-(\d+)$/;

/** `ITM-` + the number zero-padded to 4 digits; 5+ digits print as they are. */
export function formatItemCode(n: number): string {
  return `ITM-${String(n).padStart(4, '0')}`;
}

/**
 * 1 + the highest N over codes shaped `ITM-<digits>`. Callers pass every code, soft-deleted items
 * included, so a deleted item's number is never handed out again. Anything else (`X-9`) is ignored.
 */
export function nextItemCodeNumber(codes: readonly string[]): number {
  let max = 0;
  for (const code of codes) {
    const m = ITEM_CODE_RE.exec(code);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
