/**
 * Quantities are stored as Decimal(12,2). A value typed with more places must be rounded BEFORE it
 * is validated, or "0.004" passes a `> 0` check and is stored as 0.00 (and "10.004" passes a
 * `<= 10` cap it should fail). One helper so the issue, request and GRN paths round the same way.
 *
 * Pure: no Prisma, no React.
 */
export function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Round to 2 dp; throws unless the result is a finite number greater than zero. */
export function positiveQty(value: unknown, message = 'Every line needs a quantity greater than zero.'): number {
  const n = roundQty(Number(value));
  if (!Number.isFinite(n) || n <= 0) throw new Error(message);
  return n;
}
