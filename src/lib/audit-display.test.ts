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
  it('prefers display name over email', () => {
    expect(
      formatActivityLine(
        { email: 'workspacearjun7@gmail.com', name: 'Sarthak' },
        'file.upload',
        { name: 'IMG_2649.mov' },
      ),
    ).toBe("Sarthak uploaded a file 'IMG_2649.mov'");
  });

  it('falls back to email local-part when name missing', () => {
    expect(
      formatActivityLine(
        { email: 'aryayadav3480@gmail.com', name: null },
        'folder.create',
        { name: 'N' },
      ),
    ).toBe("aryayadav3480 created a folder 'N'");
  });
});
