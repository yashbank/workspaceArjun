/**
 * R2-110 — employee bank details (for the month-end transfer file). Pure; the server calls
 * `normaliseBankDetails` on every write and `maskAccountNo` before anything reaches an audit row.
 */

export type BankDetails = { bankName: string | null; bankAccountNo: string | null; ifsc: string | null };
export type BankDetailsInput = { bankName?: string | null; bankAccountNo?: string | null; ifsc?: string | null };

/** 4 letters, a literal 0, then 6 letters/digits (RBI format). */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_PATTERN = /^\d{9,18}$/;

export function normaliseIfsc(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}
export function normaliseAccountNo(raw: string): string {
  return raw.replace(/[\s-]+/g, '');
}

/** Blank means "none". Returns the cleaned value or null. */
const blankToNull = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v.trim());

/**
 * Cleans a bank block and refuses a half-filled or malformed one. An account number and an IFSC
 * only mean something together; the bank name is optional. All blank is fine (clears the details).
 */
export function normaliseBankDetails(input: BankDetails): BankDetails {
  const name = blankToNull(input.bankName);
  const acct = blankToNull(input.bankAccountNo);
  const ifsc = blankToNull(input.ifsc);
  const out: BankDetails = {
    bankName: name,
    bankAccountNo: acct === null ? null : normaliseAccountNo(acct),
    ifsc: ifsc === null ? null : normaliseIfsc(ifsc),
  };
  if (out.bankName && out.bankName.length > 80) throw new Error('Bank name is too long (80 characters at most)');
  if (out.bankAccountNo === null && out.ifsc === null) {
    if (out.bankName) throw new Error('Add the account number and IFSC too, or clear the bank name');
    return out;
  }
  if (out.bankAccountNo === null) throw new Error('Account number is required with an IFSC');
  if (out.ifsc === null) throw new Error('IFSC is required with an account number');
  if (!ACCOUNT_PATTERN.test(out.bankAccountNo)) throw new Error('Account number must be 9 to 18 digits');
  if (!IFSC_PATTERN.test(out.ifsc)) throw new Error('IFSC must look like SBIN0001234 (4 letters, a zero, then 6 letters or digits)');
  return out;
}

/** "••••1234" — enough to recognise, never enough to use. */
export function maskAccountNo(accountNo: string | null | undefined): string | null {
  if (!accountNo) return null;
  return `••••${accountNo.slice(-4)}`;
}
