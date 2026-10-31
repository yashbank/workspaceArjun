/**
 * R2-324: statutory deductions and the advance recovery, from the gross pay payroll already computed.
 * Pure: no Prisma, no React. Whole rupees, like the rest of the payslip.
 *
 *  - PF   `salary.pf_percent` of BASIC (default 12).
 *  - ESIC `salary.esic_percent` of GROSS (default 0.75), only while gross <= `salary.esic_ceiling` (default 21000).
 *  - PT   `salary.pt_monthly` flat (default 200) once gross >= `salary.pt_min_gross` (default 10000).
 *  - Advance: what the Owner recorded for recovery this month (MisSalaryAdvance), capped at what is left after the
 *    statutory lines so net pay never goes below zero.
 */
export type DeductionPolicy = { pfPercent: number; esicPercent: number; esicCeiling: number; ptMonthly: number; ptMinGross: number };

export const DEFAULT_DEDUCTION_POLICY: DeductionPolicy = { pfPercent: 12, esicPercent: 0.75, esicCeiling: 21000, ptMonthly: 200, ptMinGross: 10000 };

export type Deductions = { pf: number; esic: number; pt: number; advance: number; netPay: number };

const num = (raw: string | null | undefined, fallback: number): number => {
  const n = Number.parseFloat(raw ?? '');
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** The five stored rule values (text) as numbers; anything unset or unreadable keeps its default. */
export function deductionPolicyFrom(raw: { pfPercent?: string | null; esicPercent?: string | null; esicCeiling?: string | null; ptMonthly?: string | null; ptMinGross?: string | null }): DeductionPolicy {
  const d = DEFAULT_DEDUCTION_POLICY;
  return {
    pfPercent: num(raw.pfPercent, d.pfPercent),
    esicPercent: num(raw.esicPercent, d.esicPercent),
    esicCeiling: num(raw.esicCeiling, d.esicCeiling),
    ptMonthly: num(raw.ptMonthly, d.ptMonthly),
    ptMinGross: num(raw.ptMinGross, d.ptMinGross),
  };
}

export function deductionsFor(pay: { basicWage: number; grossPay: number }, policy: DeductionPolicy, advanceRequested = 0): Deductions {
  const gross = Math.max(0, pay.grossPay);
  const pf = Math.round(Math.max(0, pay.basicWage) * policy.pfPercent / 100);
  const esic = gross > 0 && gross <= policy.esicCeiling ? Math.round(gross * policy.esicPercent / 100) : 0;
  const pt = gross >= policy.ptMinGross && gross > 0 ? Math.round(policy.ptMonthly) : 0;
  const afterStatutory = Math.max(0, gross - pf - esic - pt);
  const advance = Math.min(Math.max(0, Math.round(advanceRequested)), afterStatutory);
  return { pf, esic, pt, advance, netPay: Math.max(0, afterStatutory - advance) };
}
