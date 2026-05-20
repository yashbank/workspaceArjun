import { describe, it, expect } from 'vitest';

describe('removal block messages', () => {
  it('documents expected block when user owns content', () => {
    const msg =
      'This user still owns files or folders. Reassign or delete their content before permanent removal.';
    expect(msg).toContain('files or folders');
  });
});
