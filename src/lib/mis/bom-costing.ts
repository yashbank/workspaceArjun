/**
 * The maths behind D6's costing overlay.
 *
 * **Owner-only money (D24).** Nothing in this file decides who may see a figure — that is the
 * server function's gate (`getBomCosting`, `wages.read`). This file only turns quantities and
 * rates into rolled-up totals, correctly. It is pure and it never runs in the browser: the cost
 * is computed on the server and sent down as a formatted string, because CLAUDE.md is explicit
 * that money is "computed in server/mis/, sent down as a formatted string. Never derived
 * client-side."
 *
 * **"Not priced" is a fact; ₹0 is a lie** (D6's own words). A material with no rate recorded is
 * NOT free: it is unpriced, it contributes nothing to a total that is then labelled a FLOOR, and
 * it is counted so the screen can say "one item is unpriced, so this total is a floor, not the
 * figure". Counting an unpriced item as free "is how a quotation gets built on a number nobody
 * checked". A rate that IS recorded as 0 is a real, deliberate figure (a free-issue material)
 * and is priced at ₹0.00 — `null` and `0` are different facts and stay different.
 *
 * **Integer paise.** Quantity and rate are both `Decimal(12,2)`; multiplying them as floats
 * drifts (0.1 × 3 is not 0.3), and a total that is a paisa out is the kind of error that costs
 * an hour to find in an audit. Everything here is computed in whole paise and only formatted at
 * the end.
 *
 * Pure: no Prisma, no React.
 */

export type CostMaterial = { id: string; quantity: unknown; ratePerUnit: unknown };
export type CostStage = { id: string; materials: CostMaterial[] };

/** Whole paise, or `null` when there is no recorded rate. */
export type Paise = number | null;

const toPaise = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/**
 * The cost of one line in paise, or null when it cannot be priced.
 *
 * `quantity × rate`, both taken to paise first so the product is exact: (qty·100)·(rate·100)
 * is 10⁴× the rupee product, and dividing by 100 leaves paise.
 */
export function lineCost(quantity: unknown, ratePerUnit: unknown): Paise {
  const rate = toPaise(ratePerUnit);
  const qty = toPaise(quantity);
  if (rate === null || qty === null) return null; // no rate, or no usable quantity: unpriced, not free
  return Math.round((qty * rate) / 100);
}

export type CostedMaterial = { id: string; paise: Paise };
export type CostedStage = { id: string; subtotal: number; unpriced: number; materials: CostedMaterial[] };

export type BomCost = {
  stages: CostedStage[];
  total: number;
  /** Lines with no recorded rate. */
  unpriced: number;
  /** Lines that were priced. */
  priced: number;
  /** True when anything is unpriced: the total is then a lower bound, and must be labelled so. */
  isFloor: boolean;
};

/**
 * Roll the tree up: line → stage subtotal → BOM total.
 *
 * A stage that is entirely unpriced has a subtotal of 0 AND `unpriced > 0`; the screen must show
 * that as "not priced", never as ₹0 — the count is what makes the difference recoverable.
 */
export function rollUp(stages: readonly CostStage[]): BomCost {
  let total = 0;
  let unpriced = 0;
  let priced = 0;

  const costed = stages.map((stage) => {
    let subtotal = 0;
    let stageUnpriced = 0;
    const materials = stage.materials.map((m) => {
      const paise = lineCost(m.quantity, m.ratePerUnit);
      if (paise === null) {
        stageUnpriced += 1;
        unpriced += 1;
      } else {
        subtotal += paise;
        priced += 1;
      }
      return { id: m.id, paise };
    });
    total += subtotal;
    return { id: stage.id, subtotal, unpriced: stageUnpriced, materials };
  });

  return { stages: costed, total, unpriced, priced, isFloor: unpriced > 0 };
}

/**
 * `₹3,31,320` for a whole-rupee amount, `₹8.28` when there are paise — Indian digit grouping,
 * and no trailing ".00" that would make a round total look falsely precise.
 */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * A BOM with every material's `ratePerUnit` REMOVED (not blanked) — what any role without
 * `wages.read` may be handed (D24, F-06). Shared by every server function that returns a BOM
 * tree, so there is one definition of "the tree without its rates" and no function can forget it.
 * Everything else on the BOM — stages, quantities, units, items — is untouched.
 */
type Rated = { stages: { materials: { ratePerUnit?: unknown }[] }[] };
export type WithoutRates<B extends Rated> = B extends { stages: (infer S)[] }
  ? Omit<B, 'stages'> & { stages: (S extends { materials: (infer M)[] } ? Omit<S, 'materials'> & { materials: Omit<M, 'ratePerUnit'>[] } : never)[] }
  : never;

export function withoutRates<B extends Rated>(bom: B): WithoutRates<B> {
  return {
    ...bom,
    stages: bom.stages.map((stage) => ({
      ...stage,
      materials: stage.materials.map((material) => {
        const { ratePerUnit: _withheld, ...rest } = material;
        void _withheld;
        return rest;
      }),
    })),
  } as unknown as WithoutRates<B>;
}
