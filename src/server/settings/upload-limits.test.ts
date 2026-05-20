import { describe, it, expect } from 'vitest';
import {
  getFileTypeFromName,
  limitOptionToBytes,
  assertFileSizeWithinLimit,
} from './upload-limits';

describe('upload limits', () => {
  it('detects file types from extension', () => {
    expect(getFileTypeFromName('print.pdf')).toBe('pdf');
    expect(getFileTypeFromName('logo.cdr')).toBe('cdr');
    expect(getFileTypeFromName('photo.JPG')).toBe('jpg');
    expect(getFileTypeFromName('archive.zip')).toBe('zip');
    expect(getFileTypeFromName('readme.txt')).toBe('other');
  });

  it('converts limit options to bytes', () => {
    expect(limitOptionToBytes('2gb')).toBe(2 * 1024 * 1024 * 1024);
    expect(limitOptionToBytes('unlimited')).toBeNull();
  });

  it('rejects files over limit', () => {
    expect(() =>
      assertFileSizeWithinLimit(100 * 1024 * 1024, 'doc.pdf', 50 * 1024 * 1024, 'pdf'),
    ).toThrow(/limited/i);
  });

  it('allows files under unlimited', () => {
    expect(() =>
      assertFileSizeWithinLimit(10 * 1024 * 1024 * 1024, 'big.zip', null, 'zip'),
    ).not.toThrow();
  });
});
