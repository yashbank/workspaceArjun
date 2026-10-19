import { describe, expect, it } from 'vitest';

import { toCsv } from './wastage-csv';
import {
  BAD_BANK_DETAILS,
  BANK_TRANSFER_HEADERS,
  NO_BANK_DETAILS,
  bankDetailGaps,
  bankDetailsProblem,
  buildBankTransfer,
  paiseToAmount,
  toPaise,
} from './bank-transfer';

const acct = (id: string, bankAccountNo: string | null, ifsc: string | null, bankName: string | null = 'SBI') => ({ id, bankName, bankAccountNo, ifsc });
const pay = (employeeId: string, employeeCode: string, employeeName: string, grossPay: number) => ({ employeeId, employeeCode, employeeName, grossPay });

describe('R2-110 — money is exact', () => {
  it('rupees ↔ paise round-trip with two decimals', () => {
    expect(toPaise(2270)).toBe(227000);
    expect(toPaise(0.1 + 0.2)).toBe(30); // 0.30000000000000004 → 30 paise, not 30.000000000000004
    expect(paiseToAmount(227000)).toBe('2270.00');
    expect(paiseToAmount(73105)).toBe('731.05');
    expect(paiseToAmount(7)).toBe('0.07');
    expect(paiseToAmount(1873456)).toBe('18734.56');
  });

  it('three lines 2270 + 731 + 18735 → total 21736.00 exactly; each amount as written', () => {
    const file = buildBankTransfer(
      [pay('e3', 'E-003', 'Chitra', 18735), pay('e1', 'E-001', 'Asha', 2270), pay('e2', 'E-002', 'Bala', 731)],
      new Map([
        ['e1', acct('e1', '123456789012', 'SBIN0001234')],
        ['e2', acct('e2', '000111222333', 'HDFC0000123', 'HDFC Bank')],
        ['e3', acct('e3', '9876543210', 'ICIC0004321', null)],
      ]),
      'Salary Jan 2026',
    );
    expect(file.payableCount).toBe(3);
    expect(file.totalPaise).toBe(2173600);
    expect(paiseToAmount(file.totalPaise)).toBe('21736.00');
    expect(file.rows).toEqual([
      [...BANK_TRANSFER_HEADERS],
      ['Asha', '123456789012', 'SBIN0001234', 'SBI', '2270.00', 'E-001', 'Salary Jan 2026'],
      ['Bala', '000111222333', 'HDFC0000123', 'HDFC Bank', '731.00', 'E-002', 'Salary Jan 2026'],
      ['Chitra', '9876543210', 'ICIC0004321', null, '18735.00', 'E-003', 'Salary Jan 2026'],
    ]);
    // Leading zeros of an account number survive into the CSV text.
    expect(toCsv(file.rows)).toContain('Bala,000111222333,HDFC0000123,HDFC Bank,731.00,E-002,Salary Jan 2026');
  });
});

describe('R2-110 — employees without usable bank details are skipped and listed', () => {
  it('skips missing / invalid details, leaves zero-pay out silently, totals only the paid', () => {
    const file = buildBankTransfer(
      [
        pay('e1', 'E-001', 'Asha', 2270),
        pay('e2', 'E-002', 'Bala', 731), // no record at all
        pay('e3', 'E-003', 'Chitra', 500), // blank fields
        pay('e4', 'E-004', 'Dev', 900), // bad IFSC
        pay('e5', 'E-005', 'Esha', 0), // nothing to pay
      ],
      new Map([
        ['e1', acct('e1', '1234 5678 9012', 'sbin0001234')],
        ['e3', acct('e3', null, null, null)],
        ['e4', acct('e4', '123456789012', 'SBIN1234')],
        ['e5', acct('e5', '123456789012', 'SBIN0001234')],
      ]),
      'n',
    );
    expect(file.payableCount).toBe(1);
    expect(file.rows[1].slice(1, 3)).toEqual(['123456789012', 'SBIN0001234']); // normalised
    expect(file.totalPaise).toBe(227000);
    expect(file.zeroPayCount).toBe(1);
    expect(file.skipped).toEqual([
      { employeeId: 'e2', employeeCode: 'E-002', employeeName: 'Bala', reason: NO_BANK_DETAILS },
      { employeeId: 'e3', employeeCode: 'E-003', employeeName: 'Chitra', reason: NO_BANK_DETAILS },
      { employeeId: 'e4', employeeCode: 'E-004', employeeName: 'Dev', reason: BAD_BANK_DETAILS },
    ]);
  });

  it('bankDetailsProblem: an account without an IFSC is not usable', () => {
    expect(bankDetailsProblem(undefined)).toBe(NO_BANK_DETAILS);
    expect(bankDetailsProblem(acct('x', '123456789012', null))).toBe(BAD_BANK_DETAILS);
    expect(bankDetailsProblem(acct('x', '12', 'SBIN0001234'))).toBe(BAD_BANK_DETAILS);
    expect(bankDetailsProblem(acct('x', '123456789012', 'SBIN0001234'))).toBeNull();
  });

  it('bankDetailGaps lists only the people who would be skipped, by code, with no account number', () => {
    const gaps = bankDetailGaps(
      [
        { employeeId: 'e2', employeeCode: 'E-002', employeeName: 'Bala' },
        { employeeId: 'e1', employeeCode: 'E-001', employeeName: 'Asha' },
      ],
      new Map([['e1', acct('e1', '123456789012', 'SBIN0001234')]]),
    );
    expect(gaps).toEqual([{ employeeId: 'e2', employeeCode: 'E-002', employeeName: 'Bala', reason: NO_BANK_DETAILS }]);
  });
});
