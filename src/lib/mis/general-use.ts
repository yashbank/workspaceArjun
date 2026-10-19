/**
 * R2-80 / R2-62 / Q11 — "General / factory use".
 *
 * An issue or material request that names no order is allowed ONLY as General / factory use (grease, oil,
 * consumables): it needs a reason and a cost centre, is tagged GENERAL and is shown as "not linked to any order".
 * This reconciles the earlier rule (R2-62/63: stock may not leave unattributed) — the attribution is now the
 * reason + cost centre. With an order, the order IS the attribution and any general fields are ignored.
 *
 * Pure: no Prisma, no React.
 */

/** The master-option group the cost centres come from (department names + "General"). */
export const COST_CENTER_GROUP = 'COST_CENTER';

export const GENERAL_REASON_MIN = 3;

export const GENERAL_USE_REQUIRED = 'No order picked — mark this as General / factory use and give a reason and a cost centre.';
export const GENERAL_REASON_REQUIRED = `Give a reason for the General / factory use (at least ${GENERAL_REASON_MIN} characters).`;
export const GENERAL_COST_CENTER_REQUIRED = 'Pick a cost centre for the General / factory use.';
export const NOT_LINKED_TO_ORDER = 'not linked to any order';

export type GeneralUseInput = { reason?: string | null; costCenter?: string | null } | null | undefined;

export type GeneralUse = {
  isGeneral: boolean;
  generalReason: string | null;
  costCenter: string | null;
};

/** What the issue / request row stores. Throws the sentence the person reads when a no-order movement is incomplete. */
export function resolveGeneralUse(orderId: string | null | undefined, general: GeneralUseInput): GeneralUse {
  if (orderId) return { isGeneral: false, generalReason: null, costCenter: null };
  if (!general) throw new Error(GENERAL_USE_REQUIRED);
  const reason = (general.reason ?? '').trim();
  const costCenter = (general.costCenter ?? '').trim();
  if (reason.length < GENERAL_REASON_MIN) throw new Error(GENERAL_REASON_REQUIRED);
  if (!costCenter) throw new Error(GENERAL_COST_CENTER_REQUIRED);
  return { isGeneral: true, generalReason: reason, costCenter };
}

/** One line for a list / detail screen: "General / factory use · Press · grease for the plates (not linked to any order)". */
export function generalUseLabel(row: { isGeneral?: boolean | null; costCenter?: string | null; generalReason?: string | null }): string | null {
  if (!row.isGeneral) return null;
  const parts = ['General / factory use', row.costCenter, row.generalReason].filter((p): p is string => Boolean(p && p.trim()));
  return `${parts.join(' · ')} (${NOT_LINKED_TO_ORDER})`;
}

/**
 * The General-use block a STORED request carries, back in the shape `resolveGeneralUse` takes. A note with no order
 * that was raised before tagging existed (never tagged) is approved as General, flagged as legacy, rather than
 * becoming un-approvable.
 */
export function storedGeneralInput(req: { orderId?: string | null; isGeneral?: boolean | null; generalReason?: string | null; costCenter?: string | null }): GeneralUseInput {
  if (req.isGeneral) return { reason: req.generalReason, costCenter: req.costCenter };
  return req.orderId ? null : { reason: 'Raised before General / factory use was recorded', costCenter: 'General' };
}
