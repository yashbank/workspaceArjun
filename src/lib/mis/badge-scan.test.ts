import { describe, expect, it } from 'vitest';
import { parseScannedBadge, resolveScan } from './badge-scan';

describe('parseScannedBadge', () => {
  it('takes the bare code the badge QR encodes', () => {
    expect(parseScannedBadge('EMP001')).toBe('EMP001');
  });
  it('trims, upper-cases and strips scanner control characters', () => {
    expect(parseScannedBadge('  emp-001\r\n')).toBe('EMP-001');
    expect(parseScannedBadge('\tEMP 001\u0000')).toBe('EMP001');
  });
  it('tolerates a prefix or a URL wrapper', () => {
    expect(parseScannedBadge('badge:emp7')).toBe('EMP7');
    expect(parseScannedBadge('code = EMP7')).toBe('EMP7');
    expect(parseScannedBadge('https://x.example/b/EMP7')).toBe('EMP7');
    expect(parseScannedBadge('https://x.example/scan?code=emp9')).toBe('EMP9');
  });
  it('rejects empty, oversized and non-code text', () => {
    expect(parseScannedBadge('')).toBeNull();
    expect(parseScannedBadge('   ')).toBeNull();
    expect(parseScannedBadge(null)).toBeNull();
    expect(parseScannedBadge(undefined)).toBeNull();
    expect(parseScannedBadge('A'.repeat(100))).toBeNull();
    expect(parseScannedBadge('{"id":1}')).toBeNull();
    expect(parseScannedBadge('hello world!')).toBeNull();
    expect(parseScannedBadge('https://')).toBeNull();
  });
});

describe('resolveScan', () => {
  const roster = [{ employeeCode: 'EMP001', name: 'A' }, { employeeCode: 'emp002', name: 'B' }];
  it('finds an employee case-insensitively', () => {
    expect(resolveScan('emp001', roster)).toMatchObject({ kind: 'FOUND', employee: { name: 'A' } });
    expect(resolveScan('EMP002', roster)).toMatchObject({ kind: 'FOUND', employee: { name: 'B' } });
  });
  it('separates an unknown badge from garbage', () => {
    expect(resolveScan('EMP999', roster)).toEqual({ kind: 'UNKNOWN', code: 'EMP999' });
    expect(resolveScan('???', roster)).toEqual({ kind: 'INVALID' });
  });
});
