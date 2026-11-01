import { describe, expect, it } from 'vitest';
import { DEFAULT_DEDUCTION_POLICY, deductionPolicyFrom, deductionsFor } from './payroll-deductions';

describe('R2-324 statutory deductions', () => {
  it('PF 12% of basic, ESIC 0.75% of gross under the ceiling, PT 200 from 10,000 gross; net = gross less all', () => {
    expect(deductionsFor({ basicWage: 15000, grossPay: 18000 }, DEFAULT_DEDUCTION_POLICY)).toEqual({ pf: 1800, esic: 135, pt: 200, advance: 0, netPay: 15865 });
  });
  it('no ESIC above the ceiling, no PT below the PT floor', () => {
    expect(deductionsFor({ basicWage: 20000, grossPay: 25000 }, DEFAULT_DEDUCTION_POLICY)).toMatchObject({ esic: 0, pt: 200 });
    expect(deductionsFor({ basicWage: 6000, grossPay: 8000 }, DEFAULT_DEDUCTION_POLICY)).toMatchObject({ esic: 60, pt: 0 });
    expect(deductionsFor({ basicWage: 0, grossPay: 0 }, DEFAULT_DEDUCTION_POLICY)).toEqual({ pf: 0, esic: 0, pt: 0, advance: 0, netPay: 0 });
  });
  it('an advance is recovered after the statutory lines and never takes net pay below zero', () => {
    expect(deductionsFor({ basicWage: 10000, grossPay: 12000 }, DEFAULT_DEDUCTION_POLICY, 3000)).toMatchObject({ advance: 3000, netPay: 12000 - 1200 - 90 - 200 - 3000 });
    expect(deductionsFor({ basicWage: 10000, grossPay: 12000 }, DEFAULT_DEDUCTION_POLICY, 50000)).toMatchObject({ advance: 10510, netPay: 0 });
  });
  it('rules read as text; unset or junk keeps the default', () => {
    expect(deductionPolicyFrom({ pfPercent: '10', esicPercent: null, esicCeiling: 'abc', ptMonthly: '0', ptMinGross: undefined })).toEqual({ pfPercent: 10, esicPercent: 0.75, esicCeiling: 21000, ptMonthly: 0, ptMinGross: 10000 });
  });
});
