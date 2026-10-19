/**
 * R2-77 — Pick & Staging, as pure rules.
 *
 * approved Material Request -> Pick List (PENDING) -> Store Guy records what he picked (PICKING) -> Staged -> handed
 * to the supervisor (HANDED_OVER). Stock moves ONLY on handover, and only for what was actually picked.
 *
 * Pure: no Prisma, no React.
 */
import { roundQty } from './quantity';

export type PickStatus = 'PENDING' | 'PICKING' | 'STAGED' | 'HANDED_OVER';

export const PICK_STATUS_LABEL: Record<PickStatus, string> = {
  PENDING: 'Waiting to be picked',
  PICKING: 'Being picked',
  STAGED: 'Staged — ready to hand over',
  HANDED_OVER: 'Handed over',
};

export type PickLine = { id: string; requiredQty: number; pickedQty: number };
export type PickInput = { lineId: string; pickedQty: number };

/** The only edge each state may take next; HANDED_OVER is terminal. */
const NEXT: Record<PickStatus, PickStatus | null> = { PENDING: 'PICKING', PICKING: 'STAGED', STAGED: 'HANDED_OVER', HANDED_OVER: null };

export function nextPickStatus(status: PickStatus): PickStatus | null {
  return NEXT[status];
}

/** Recording picks is allowed until the list is staged. */
export function canRecordPicks(status: PickStatus): boolean {
  return status === 'PENDING' || status === 'PICKING';
}

/** Throws the sentence the storekeeper reads when a picked quantity is not 0..required. Returns the merged lines. */
export function applyPicks(lines: readonly PickLine[], picks: readonly PickInput[]): PickLine[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const seen = new Set<string>();
  for (const p of picks) {
    if (!byId.has(p.lineId)) throw new Error('One of the lines is not on this pick list.');
    if (seen.has(p.lineId)) throw new Error('A line appears twice — send one quantity per line.');
    seen.add(p.lineId);
    const qty = roundQty(Number(p.pickedQty));
    if (!Number.isFinite(qty) || qty < 0) throw new Error('A picked quantity cannot be negative.');
    const line = byId.get(p.lineId)!;
    if (qty > line.requiredQty) throw new Error(`Cannot pick ${qty}: only ${line.requiredQty} was approved for this line.`);
  }
  const picked = new Map(picks.map((p) => [p.lineId, roundQty(Number(p.pickedQty))]));
  return lines.map((l) => ({ ...l, pickedQty: picked.get(l.id) ?? l.pickedQty }));
}

/** Staging needs at least one picked line (a list with nothing picked has nothing to hand over). */
export function stagingRefusal(lines: readonly PickLine[]): string | null {
  return lines.some((l) => l.pickedQty > 0) ? null : 'Pick at least one line before staging the list.';
}

/** The cart a handover issues: only lines with something picked, never more than approved. */
export function handoverCart(lines: readonly PickLine[]): { lineId: string; qty: number }[] {
  return lines.filter((l) => l.pickedQty > 0).map((l) => ({ lineId: l.id, qty: Math.min(l.pickedQty, l.requiredQty) }));
}

export function pickProgress(lines: readonly PickLine[]): { picked: number; required: number; complete: boolean } {
  const required = roundQty(lines.reduce((s, l) => s + l.requiredQty, 0));
  const picked = roundQty(lines.reduce((s, l) => s + l.pickedQty, 0));
  return { picked, required, complete: required > 0 && lines.every((l) => l.pickedQty >= l.requiredQty) };
}
