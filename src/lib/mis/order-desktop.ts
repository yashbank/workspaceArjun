/**
 * The shape D4 receives — plain strings and numbers only.
 *
 * **There is no rupee here.** D4: "No money on this screen. Not order value, not material cost,
 * not a margin." The screen is handed this type and nothing else, so it cannot leak a field it
 * was never given — the guarantee is the type, not the discipline of whoever edits the page.
 * `order-desktop.test.ts` also walks a built payload for every role and asserts no money key or
 * currency symbol appears in it.
 *
 * Pure: types only.
 */
import type { PhaseState, QcSlot } from './order-timeline';

export type BlockerView =
  | { kind: 'QC_FAILURE'; parameter: string | null; timeLabel: string }
  | { kind: 'WASTE_REASON'; qtyWaste: number; timeLabel: string }
  | { kind: 'NO_PRODUCTION' };

export type PhaseRowView = {
  id: string;
  sequence: number;
  name: string;
  nameHi: string | null;
  state: PhaseState;
  /** "Heidelberg SM 74 · Ramesh Kumar · 4 operators" — only the parts that are recorded. */
  detail: string;
  signedAtLabel: string | null;
  startedAtLabel: string | null;
  plannedEndLabel: string | null;
  figures: { produced: number; waste: number; handedOver: number | null; unit: string } | null;
  blockers: BlockerView[];
};

export type OrderDesktopData = {
  orderId: string;
  orderNumber: string;
  description: string | null;
  customer: string | null;
  status: string;
  receivedLabel: string;
  deliveryLabel: string | null;
  daysLeft: number | null;
  progress: { done: number; total: number };
  position: { at: number; of: number; name: string } | null;
  phases: PhaseRowView[];
  /** Present only when the signed-in person may actually sign the running phase. */
  signOff: { phaseId: string; name: string; blockedReasons: number } | null;
  quality: {
    strip: QcSlot[];
    shiftLabel: string | null;
    taken: number;
    passed: number;
    openDefect: { parameter: string | null; defectType: string | null } | null;
  };
  documents: { id: string; name: string; meta: string }[];
  bom: { statusLabel: string; items: { id: string; description: string; quantity: string; unit: string }[] } | null;
};

