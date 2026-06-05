import { describe, it, expect } from 'vitest';
import { sortFiles, type SortableFile } from './sort-files';

function f(
  name: string,
  sizeBytes: string | null,
  createdAt = '2026-01-01T00:00:00.000Z',
): SortableFile {
  return {
    name,
    createdAt,
    currentVersion: sizeBytes === null ? null : { sizeBytes, createdAt },
  };
}

const names = (files: SortableFile[]) => files.map((x) => x.name);

describe('sortFiles', () => {
  it('sorts by name ascending and descending', () => {
    const files = [f('banana.pdf', '1'), f('apple.pdf', '1'), f('cherry.pdf', '1')];
    expect(names(sortFiles(files, 'name', 'asc'))).toEqual([
      'apple.pdf',
      'banana.pdf',
      'cherry.pdf',
    ]);
    expect(names(sortFiles(files, 'name', 'desc'))).toEqual([
      'cherry.pdf',
      'banana.pdf',
      'apple.pdf',
    ]);
  });

  it('sorts by size numerically, not lexically', () => {
    const files = [f('a', '9'), f('b', '100'), f('c', '20')];
    // Lexical would give 100 < 20 < 9; numeric must give 9 < 20 < 100.
    expect(names(sortFiles(files, 'size', 'asc'))).toEqual(['a', 'c', 'b']);
    expect(names(sortFiles(files, 'size', 'desc'))).toEqual(['b', 'c', 'a']);
  });

  it('treats a missing current version as size 0', () => {
    const files = [f('big', '500'), f('missing', null), f('small', '10')];
    expect(names(sortFiles(files, 'size', 'asc'))).toEqual(['missing', 'small', 'big']);
  });

  it('sorts by date using the current version timestamp', () => {
    const files = [
      f('old', '1', '2026-01-01T00:00:00.000Z'),
      f('new', '1', '2026-06-01T00:00:00.000Z'),
      f('mid', '1', '2026-03-01T00:00:00.000Z'),
    ];
    expect(names(sortFiles(files, 'date', 'asc'))).toEqual(['old', 'mid', 'new']);
    expect(names(sortFiles(files, 'date', 'desc'))).toEqual(['new', 'mid', 'old']);
  });

  it('sorts by file extension (type)', () => {
    const files = [f('c.zip', '1'), f('a.cdr', '1'), f('b.pdf', '1')];
    expect(names(sortFiles(files, 'type', 'asc'))).toEqual(['a.cdr', 'b.pdf', 'c.zip']);
    expect(names(sortFiles(files, 'type', 'desc'))).toEqual(['c.zip', 'b.pdf', 'a.cdr']);
  });

  it('breaks ties on name ascending regardless of primary direction', () => {
    // Equal size; name-asc tiebreak must hold for both asc and desc.
    const files = [f('zeta', '5'), f('alpha', '5'), f('mike', '5')];
    expect(names(sortFiles(files, 'size', 'asc'))).toEqual(['alpha', 'mike', 'zeta']);
    expect(names(sortFiles(files, 'size', 'desc'))).toEqual(['alpha', 'mike', 'zeta']);
  });

  it('does not mutate the input array', () => {
    const files = [f('b', '1'), f('a', '1')];
    const original = names(files);
    sortFiles(files, 'name', 'asc');
    expect(names(files)).toEqual(original);
  });

  it('defaults unknown sort keys to name ordering', () => {
    const files = [f('b', '1'), f('a', '1')];
    expect(names(sortFiles(files, 'whatever', 'asc'))).toEqual(['a', 'b']);
  });
});
