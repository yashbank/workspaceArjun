import { describe, it, expect } from 'vitest';
import { sanitizeUploadFilename, withCopySuffix } from './upload-filename';

describe('sanitizeUploadFilename', () => {
  it('strips directory paths', () => {
    expect(sanitizeUploadFilename('/a/b/report.pdf')).toBe('report.pdf');
    expect(sanitizeUploadFilename('C:\\docs\\report.pdf')).toBe('report.pdf');
  });

  it('rejects empty / dot names', () => {
    expect(() => sanitizeUploadFilename('   ')).toThrow();
    expect(() => sanitizeUploadFilename('.')).toThrow();
    expect(() => sanitizeUploadFilename('..')).toThrow();
  });
});

describe('withCopySuffix', () => {
  it('inserts the copy suffix before a single extension', () => {
    expect(withCopySuffix('report.pdf')).toBe('report (copy).pdf');
  });

  it('keeps only the final extension for multi-dot names', () => {
    expect(withCopySuffix('archive.tar.gz')).toBe('archive.tar (copy).gz');
  });

  it('handles names with no extension', () => {
    expect(withCopySuffix('README')).toBe('README (copy)');
  });

  it('handles dotfiles (leading dot, no real extension)', () => {
    // "gitignore" is treated as the extension here; acceptable for display names.
    expect(withCopySuffix('.gitignore')).toBe(' (copy).gitignore');
  });
});
