/**
 * R2-79 — Return-to-Store: the rules for sending unused / rejected material back from the floor.
 * Pure: no Prisma, no React.
 */
import { positiveQty } from './quantity';

export const RETURN_REASON_MIN = 3;
export const RETURN_REASON_REQUIRED = `Say why the material is coming back (at least ${RETURN_REASON_MIN} characters).`;
export const RETURN_ALREADY_DECIDED = 'This return was already decided.';

/** Throws the sentence the person reads; returns the cleaned values. */
export function validateReturn(input: { qty: unknown; reason: string | null | undefined }): { qty: number; reason: string } {
  const qty = positiveQty(input.qty, 'Enter how much is coming back (more than zero).');
  const reason = (input.reason ?? '').trim();
  if (reason.length < RETURN_REASON_MIN) throw new Error(RETURN_REASON_REQUIRED);
  return { qty, reason };
}

/** Only a Store Guy / Admin / Owner (store.write) books stock back in; others' returns wait as PENDING. */
export function returnStartsAccepted(canWriteStore: boolean): boolean {
  return canWriteStore;
}
