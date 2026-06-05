/**
 * Client-side file sorting that mirrors the server ordering in
 * `GET /api/files` (see src/app/api/files/route.ts). Used to re-sort an
 * already-loaded file list without a network round-trip.
 *
 * The secondary name-ascending tiebreak matches the server: files arrive from
 * the DB in name-asc order and the server's stable in-memory sort preserves
 * that for equal primary keys — so ties always fall back to name ascending,
 * regardless of the primary direction.
 */

export type SortableFile = {
  name: string;
  createdAt: string;
  currentVersion: { sizeBytes: string; createdAt: string } | null;
};

export type FileSortBy = 'name' | 'date' | 'size' | 'type';
export type FileSortDir = 'asc' | 'desc';

function fileSize(f: SortableFile): number {
  return f.currentVersion ? Number(f.currentVersion.sizeBytes) : 0;
}

function fileTime(f: SortableFile): number {
  return new Date(f.currentVersion?.createdAt ?? f.createdAt).getTime();
}

function fileExt(f: SortableFile): string {
  return f.name.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Returns a new sorted array; does not mutate the input.
 * `by` is typed loosely so callers can pass the raw sort key string.
 */
export function sortFiles<T extends SortableFile>(
  files: T[],
  by: FileSortBy | string,
  dir: FileSortDir,
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byNameAsc = (a: T, b: T) => a.name.localeCompare(b.name);

  const cmp = (a: T, b: T): number => {
    if (by === 'size') {
      const d = fileSize(a) - fileSize(b);
      return d !== 0 ? sign * d : byNameAsc(a, b);
    }
    if (by === 'date') {
      const d = fileTime(a) - fileTime(b);
      return d !== 0 ? sign * d : byNameAsc(a, b);
    }
    if (by === 'type') {
      const d = fileExt(a).localeCompare(fileExt(b));
      return d !== 0 ? sign * d : byNameAsc(a, b);
    }
    // name (default)
    return sign * byNameAsc(a, b);
  };

  return [...files].sort(cmp);
}
