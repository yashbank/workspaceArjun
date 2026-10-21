import { describe, expect, it } from 'vitest';
import { maskAccountNo, normaliseBankDetails } from './bank-details';

const ok = { bankName: 'SBI', bankAccountNo: '123456789012', ifsc: 'SBIN0001234' };

describe('normaliseBankDetails', () => {
  it('accepts and cleans a valid block', () => {
    expect(normaliseBankDetails({ bankName: ' SBI ', bankAccountNo: '1234 5678 9012', ifsc: ' sbin0001234 ' })).toEqual(ok);
  });
  it('all blank clears the details', () => {
    expect(normaliseBankDetails({ bankName: '', bankAccountNo: ' ', ifsc: null })).toEqual({ bankName: null, bankAccountNo: null, ifsc: null });
  });
  it('rejects a bad IFSC and a bad account number', () => {
    expect(() => normaliseBankDetails({ ...ok, ifsc: 'SBIN1001234' })).toThrow(/IFSC must look like/);
    expect(() => normaliseBankDetails({ ...ok, ifsc: 'SBI0001234' })).toThrow(/IFSC/);
    expect(() => normaliseBankDetails({ ...ok, bankAccountNo: '12345' })).toThrow(/9 to 18 digits/);
    expect(() => normaliseBankDetails({ ...ok, bankAccountNo: '12345678901A' })).toThrow(/9 to 18 digits/);
  });
  it('rejects half-filled blocks', () => {
    expect(() => normaliseBankDetails({ bankName: null, bankAccountNo: '123456789', ifsc: null })).toThrow(/IFSC is required/);
    expect(() => normaliseBankDetails({ bankName: null, bankAccountNo: null, ifsc: 'SBIN0001234' })).toThrow(/Account number is required/);
    expect(() => normaliseBankDetails({ bankName: 'SBI', bankAccountNo: null, ifsc: null })).toThrow(/account number/);
  });
});

describe('maskAccountNo', () => {
  it('keeps only the last four', () => {
    expect(maskAccountNo('123456789012')).toBe('••••9012');
    expect(maskAccountNo(null)).toBeNull();
  });
});
