import { describe, expect, it } from 'vitest';

import {
  EMPLOYEE_CODE_STYLES,
  employeeCodeCandidates,
  generateEmployeeCode,
  normaliseEmployeeCode,
  pickEmployeeByCode,
  resolveEmployeeCodeStyle,
  validateEmployeeCode,
} from './employee-code-style';
import { resolveScan } from './badge-scan';

describe('generate', () => {
  it('EASY = EMP001, MEDIUM = EMP-0001', () => {
    expect(generateEmployeeCode('EASY', 1)).toBe('EMP001');
    expect(generateEmployeeCode('EASY', 1234)).toBe('EMP1234');
    expect(generateEmployeeCode('MEDIUM', 7)).toBe('EMP-0007');
  });
  it('HARD is 6 chars, DIFFICULT is 10 with a valid check char, both unique over 5000 seqs', () => {
    for (const style of ['HARD', 'DIFFICULT'] as const) {
      const seen = new Set<string>();
      for (let n = 1; n <= 5000; n++) {
        const c = generateEmployeeCode(style, n);
        expect(c).toHaveLength(style === 'HARD' ? 6 : 10);
        expect(validateEmployeeCode(style, c)).toBe(true);
        seen.add(c);
      }
      expect(seen.size).toBe(5000);
    }
  });
  it('every generated code validates in its own style', () => {
    for (const s of EMPLOYEE_CODE_STYLES) expect(validateEmployeeCode(s, generateEmployeeCode(s, 42))).toBe(true);
  });
});

describe('validate', () => {
  it('rejects wrong shapes and a bad check character', () => {
    expect(validateEmployeeCode('EASY', 'EMP-001')).toBe(false);
    expect(validateEmployeeCode('MEDIUM', 'EMP001')).toBe(false);
    expect(validateEmployeeCode('HARD', 'BP7K2')).toBe(false);
    expect(validateEmployeeCode('HARD', 'BP7K2O')).toBe(false);
    const good = generateEmployeeCode('DIFFICULT', 9);
    const bad = good.slice(0, 9) + (good[9] === '0' ? '1' : '0');
    expect(validateEmployeeCode('DIFFICULT', bad)).toBe(false);
  });
  it('is case-insensitive and trims', () => {
    expect(validateEmployeeCode('EASY', ' emp001 ')).toBe(true);
  });
});

describe('normalise', () => {
  it('EASY: trims, upper-cases, strips scanner noise, accepts bare digits and dashed form', () => {
    expect(normaliseEmployeeCode('EASY', ' emp001\r\n')).toBe('EMP001');
    expect(normaliseEmployeeCode('EASY', 'badge:emp001')).toBe('EMP001');
    expect(normaliseEmployeeCode('EASY', '*EMP001*')).toBe('EMP001');
    expect(normaliseEmployeeCode('EASY', '12')).toBe('EMP012');
    expect(normaliseEmployeeCode('EASY', 'EMP-0061')).toBe('EMP0061');
  });
  it('MEDIUM: EMP1, EMP001 and 7 all become EMP-000n', () => {
    expect(normaliseEmployeeCode('MEDIUM', 'emp1')).toBe('EMP-0001');
    expect(normaliseEmployeeCode('MEDIUM', 'EMP001')).toBe('EMP-0001');
    expect(normaliseEmployeeCode('MEDIUM', '7')).toBe('EMP-0007');
  });
  it('HARD/DIFFICULT: folds look-alikes, spaces and dashes', () => {
    expect(normaliseEmployeeCode('HARD', ' bp7k-2q ')).toBe('BP7K2Q');
    expect(normaliseEmployeeCode('HARD', 'BP7KZO')).toBe('BP7KZ0');
    expect(normaliseEmployeeCode('DIFFICULT', 'url: x')).not.toBe('');
  });
  it('unusable input gives empty', () => {
    expect(normaliseEmployeeCode('EASY', '')).toBe('');
    expect(normaliseEmployeeCode('HARD', null)).toBe('');
    expect(normaliseEmployeeCode('HARD', 'x'.repeat(100))).toBe('');
  });
});

describe('candidates + scan matching', () => {
  it('exact comes first, then the cross-style form of a COMPLETE code', () => {
    const c = employeeCodeCandidates(' emp001 ', 'HARD');
    expect(c[0]).toBe('EMP001');
    expect(c).toContain('EMP-0001');
  });
  it.each(['1', '001', 'EMP-1', 'EMP-01', 'emp-1', 'EMP1'])('partial %s gets no fallback', (t) => {
    expect(employeeCodeCandidates(t)).toHaveLength(1);
  });
  it('pickEmployeeByCode: exact wins, ambiguous fallback refused', () => {
    const roster = [{ employeeCode: 'EMP-001' }, { employeeCode: 'EMP001' }];
    expect(pickEmployeeByCode('EMP-001', roster)).toBe(roster[0]);
    expect(pickEmployeeByCode('EMP-1', roster)).toBeNull();
    const amb = [{ employeeCode: 'EMP-0001' }, { employeeCode: 'emp-0001 ' }];
    expect(pickEmployeeByCode('EMP001', amb)).toBeNull();
  });
  it.each(EMPLOYEE_CODE_STYLES)('resolveScan finds a %s code typed sloppily', (style) => {
    const code = generateEmployeeCode(style, 3);
    const roster = [{ employeeCode: code }, { employeeCode: 'EMP099' }];
    expect(resolveScan(` ${code.toLowerCase()}\n`, roster)).toMatchObject({ kind: 'FOUND', employee: roster[0] });
  });
  it('an existing EMP001 employee is found when typed in full, never from digits-only or partial input', () => {
    const roster = [{ employeeCode: 'EMP001' }];
    expect(resolveScan('emp001', roster).kind).toBe('FOUND');
    expect(resolveScan('1', roster).kind).toBe('UNKNOWN');
    expect(resolveScan('emp-1', roster).kind).toBe('UNKNOWN');
  });
  it('unknown style falls back to EASY', () => {
    expect(resolveEmployeeCodeStyle('nonsense')).toBe('EASY');
    expect(resolveEmployeeCodeStyle(' hard ')).toBe('HARD');
  });
});
