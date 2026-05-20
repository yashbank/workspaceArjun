import { describe, it, expect } from 'vitest';
import { formatAuditAction } from './audit-display';

describe('formatAuditAction', () => {
  it('includes file name from meta', () => {
    expect(formatAuditAction('file.upload', { name: 'photo.heic' })).toBe(
      'uploaded a file “photo.heic”',
    );
  });

  it('formats folder create', () => {
    expect(formatAuditAction('folder.create', { name: 'Q2 Assets' })).toBe(
      'created a folder “Q2 Assets”',
    );
  });
});
