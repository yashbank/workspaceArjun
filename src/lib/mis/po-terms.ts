/**
 * R2-272 — a purchase order's commercial terms. Pure, client-safe.
 *
 * Payment terms are a fixed list (owner decision, round 6B), so the printed PO never carries a typo the vendor can
 * argue over. The promised delivery date is mandatory on a new PO; POs raised before the column existed carry null.
 */
export const PAYMENT_TERMS = ['ADVANCE_100', 'ADVANCE_50', 'ON_DELIVERY', 'NET_15', 'NET_30', 'NET_45', 'NET_60'] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];
export const PAYMENT_TERMS_LABEL: Record<PaymentTerms, string> = {
  ADVANCE_100: '100% advance',
  ADVANCE_50: '50% advance, balance on delivery',
  ON_DELIVERY: 'On delivery',
  NET_15: 'Net 15 days',
  NET_30: 'Net 30 days',
  NET_45: 'Net 45 days',
  NET_60: 'Net 60 days',
};

export function isPaymentTerms(value: unknown): value is PaymentTerms {
  return typeof value === 'string' && (PAYMENT_TERMS as readonly string[]).includes(value);
}

export function paymentTermsLabel(value: string | null | undefined): string | null {
  return isPaymentTerms(value) ? PAYMENT_TERMS_LABEL[value] : value ?? null;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` that is a real calendar day, or null. */
export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** The refusal to show for a header's terms, or null. `requireDate` = a new PO (the date is mandatory there). */
export function validatePoTerms(input: { deliveryDueDate?: string | null; paymentTerms?: string | null }, requireDate: boolean): string | null {
  if (input.deliveryDueDate != null && !isDateKey(input.deliveryDueDate)) return 'Delivery date must look like 2026-11-15.';
  if (requireDate && !input.deliveryDueDate) return 'Enter the promised delivery date.';
  if (input.paymentTerms != null && input.paymentTerms !== '' && !isPaymentTerms(input.paymentTerms)) return 'Pick the payment terms from the list.';
  return null;
}
