/**
 * The shape D6 receives.
 *
 * The rupee fields — `cost`, `subtotal`, `unpriced`, `costing` — are present ONLY when the
 * server chose to compute costing, which it does only for a role holding `wages.read` (D24) and
 * only when the toggle is on. For every other role they are ABSENT FROM THE OBJECT, not `null`
 * and not empty: D6's own words are "the field is not in the response — there is nothing to
 * un-hide". `cost: null` therefore always means one thing — "this line has no rate" — and never
 * "you may not see it".
 *
 * Pure: types only.
 */

export type BomMaterialView = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  /** Owner + costing on only. `null` = no recorded rate ("not priced"). */
  cost?: string | null;
};

export type BomStageView = {
  id: string;
  name: string;
  materials: BomMaterialView[];
  /** Owner + costing on only. `null` = every line in the stage is unpriced. */
  subtotal?: string | null;
  unpriced?: number;
};

export type BomDesktopData = {
  orderId: string;
  orderNumber: string;
  description: string | null;
  bomStatus: string;
  approvedLabel: string | null;
  itemCount: number;
  stages: BomStageView[];
  /** May this person see costing at all — decides whether the toggle exists. Absent, not disabled. */
  canCost: boolean;
  /** Present only while costing is on. */
  costing?: { total: string; priced: number; unpriced: number; isFloor: boolean };
  /** Whether this person may edit the structure. */
  canEdit: boolean;
};
