/**
 * Why a purchase order exists.
 *
 * Two paths, both normal (client change, Sep 2026 — Arjun):
 *  - `FOR_ORDER`    — the materials a BOM / material request asked for, so the
 *                     PO carries the BOM reference it was raised against.
 *  - `BUFFER_STOCK` — a top-up of stock the factory keeps on hand. There is no
 *                     BOM and no customer order behind it, and that is not a
 *                     missing link for anyone to chase.
 *
 * The purpose is not its own column. `mis_purchase_orders.bom_ref` is nullable
 * and already carries the whole signal; what makes it deliberate is entry —
 * `createPO` refuses a FOR_ORDER PO with no reference and strips any reference
 * off a BUFFER_STOCK one, so a null `bomRef` means buffer stock rather than a
 * field somebody forgot.
 *
 * Lives in `lib/` because the PO screens are client components and must not
 * pull the server module (and Prisma with it) into the browser bundle.
 */
export type PoPurpose = 'FOR_ORDER' | 'BUFFER_STOCK';

/** Read the purpose off any PO-shaped row. */
export function poPurpose(po: { bomRef: string | null }): PoPurpose {
  return po.bomRef ? 'FOR_ORDER' : 'BUFFER_STOCK';
}

/** What a human should see for that purpose. */
export function poPurposeLabel(purpose: PoPurpose): string {
  return purpose === 'FOR_ORDER' ? 'From BOM requirement' : 'Buffer stock (no BOM)';
}
