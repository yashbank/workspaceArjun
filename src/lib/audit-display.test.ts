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

  it('shows source and destination for a file move', () => {
    expect(
      formatAuditAction('file.move', {
        name: 'file.pdf',
        fromName: 'Root',
        toName: 'Demo',
      }),
    ).toBe("moved a file 'file.pdf' from Root to Demo");
  });

  it('shows source and destination for a folder move', () => {
    expect(
      formatAuditAction('folder.move', {
        name: 'Designs',
        fromName: 'Client A',
        toName: 'Archive',
      }),
    ).toBe("moved a folder 'Designs' from Client A to Archive");
  });

  it('falls back to plain move text when names are missing (old events)', () => {
    expect(
      formatAuditAction('file.move', { name: 'file.pdf', fromFolder: null, toFolder: 'abc' }),
    ).toBe("moved a file 'file.pdf'");
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
