/**
 * The keys of the advisory locks that serialise stock writers (`server/mis/stock-lock.ts`).
 * Pure: no Prisma, no React.
 */

/** The lock key for an item's ledger chain: its id. */
export const itemLockKey = (itemId: string) => itemId;

/** The lock key for a PO line's received-quantity counter. */
export const poItemLockKey = (poItemId: string) => `po-item:${poItemId}`;
