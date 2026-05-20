import { describe, it, expect } from 'vitest';
import { formatAuditAction, formatActivityLine } from './audit-display';

describe('formatAuditAction', () => {
  it('uses single-quoted file names', () => {
    expect(formatAuditAction('file.upload', { name: 'IMG_2649.mov' })).toBe(
      "uploaded a file 'IMG_2649.mov'",
    );
  });

  it('formats folder create', () => {
    expect(formatAuditAction('folder.create', { name: 'N' })).toBe("created a folder 'N'");
  });
});

describe('formatActivityLine', () => {
  it('includes actor email', () => {
    expect(
      formatActivityLine(
        { email: 'workspacearjun7@gmail.com', name: null },
        'file.upload',
        { name: 'IMG_2649.mov' },
      ),
    ).toBe("workspacearjun7@gmail.com uploaded a file 'IMG_2649.mov'");
  });
});
