import { describe, it, expect } from 'vitest';
import { resolveActivePreview } from './active-preview';

type F = { id: string; currentVersionId: string };

describe('resolveActivePreview', () => {
  const list: F[] = [
    { id: 'a', currentVersionId: 'v2' },
    { id: 'b', currentVersionId: 'v1' },
  ];

  it('returns null when nothing is previewed', () => {
    expect(resolveActivePreview<F>(null, list)).toBeNull();
  });

  it('returns the fresh object from the list (latest version), not the captured one', () => {
    const captured: F = { id: 'a', currentVersionId: 'v1' }; // stale snapshot
    const result = resolveActivePreview(captured, list);
    expect(result).toBe(list[0]); // same reference as the refreshed list entry
    expect(result?.currentVersionId).toBe('v2');
  });

  it('falls back to the captured object when the file is no longer in the list', () => {
    const captured: F = { id: 'gone', currentVersionId: 'v1' };
    expect(resolveActivePreview(captured, list)).toBe(captured);
  });
});
