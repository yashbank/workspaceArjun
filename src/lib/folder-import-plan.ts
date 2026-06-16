/**
 * Pure planning for nested folder import. Turns a flat `File[]` — where each file
 * carries a `relativePath` (drag-drop) or `webkitRelativePath` (folder picker) —
 * into the folder tree that must be created and the directory each file belongs
 * in. No I/O and no React, so it is unit-testable in isolation.
 */

export type PlannedDir = {
  /** Full slash-joined path from the import root, e.g. "Project/Docs". */
  path: string;
  /** Last path segment — the folder's display name. */
  name: string;
  /** Parent directory's full path, or null when it sits at the import target. */
  parentPath: string | null;
};

export type PlannedFile = {
  file: File;
  /** Full path of the owning directory, or "" for the import target itself. */
  dirPath: string;
};

export type ImportPlan = {
  /** Top-level folder name (first path segment), for display. */
  rootName: string;
  /** Directories grouped by depth (`levels[0]` = shallowest) so a caller can
   * create each level only after its parents already exist. */
  levels: PlannedDir[][];
  files: PlannedFile[];
};

/**
 * Basenames that operating systems / file managers create automatically and
 * that must never be imported as content. Genuine dotfiles (e.g. `.env`,
 * `.gitignore`) are deliberately kept — see {@link isJunkFile}.
 */
export const IMPORT_JUNK_NAMES = new Set<string>([
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '.localized',
  '.Spotlight-V100',
  '.Trashes',
  '.fseventsd',
  '.apdisk',
  'ehthumbs.db',
  'ehthumbs_vista.db',
]);

/** Path segments (folders) that wrap junk and must never become real folders. */
const JUNK_PATH_SEGMENTS = new Set<string>([
  '__MACOSX',
  '.Spotlight-V100',
  '.Trashes',
  '.fseventsd',
]);

/**
 * True for OS / file-manager metadata that must never be imported as content.
 * Robust by design — the visible "`.DS_Store` files everywhere" bug came from
 * junk slipping through paths the exact-match set didn't cover:
 *   - case-insensitive (`.ds_store`, `THUMBS.DB`)
 *   - AppleDouble sidecars (`._anything`)
 *   - the macOS custom-icon file (`Icon\r`)
 * Genuine dotfiles (`.env`, `.gitignore`, `.npmrc`) are intentionally KEPT.
 */
export function isJunkFile(name: string): boolean {
  if (!name) return true;
  if (IMPORT_JUNK_NAMES.has(name)) return true;
  const lower = name.toLowerCase();
  for (const junk of IMPORT_JUNK_NAMES) {
    if (junk.toLowerCase() === lower) return true;
  }
  if (name.startsWith('._')) return true; // AppleDouble resource-fork sidecar
  if (name === 'Icon\r') return true; // macOS custom folder icon
  return false;
}

/** True when any directory segment of a path is an OS junk wrapper (e.g. `__MACOSX`). */
function hasJunkSegment(dirParts: string[]): boolean {
  return dirParts.some((seg) => JUNK_PATH_SEGMENTS.has(seg));
}

function pathOf(file: File): string {
  const f = file as File & { relativePath?: string; webkitRelativePath?: string };
  // Normalize to NFC so macOS-decomposed (NFD) names collapse to the same folder
  // keys/names as NFC sources, avoiding visually identical duplicate folders.
  return (f.relativePath ?? f.webkitRelativePath ?? '').normalize('NFC');
}

/**
 * True when a File carries folder-structure info — a drag-import `relativePath`
 * or a folder-picker `webkitRelativePath`. Such files originate from a folder
 * import and must go through {@link planFolderImport} (which filters OS junk and
 * rebuilds the hierarchy), never the flat uploader.
 */
export function hasImportPath(file: File): boolean {
  const f = file as File & { relativePath?: string };
  return Boolean(f.relativePath || file.webkitRelativePath);
}

export function planFolderImport(files: File[]): ImportPlan {
  const dirs = new Map<string, PlannedDir>();
  const placements: PlannedFile[] = [];
  let rootName = 'Imported Folder';

  for (const file of files) {
    if (isJunkFile(file.name)) continue; // skip OS junk files (.DS_Store, ._*, …)
    const parts = pathOf(file).split('/').filter(Boolean);
    const dirParts = parts.slice(0, -1); // drop the filename
    if (hasJunkSegment(dirParts)) continue; // skip anything inside __MACOSX etc.
    if (dirParts.length > 0 && rootName === 'Imported Folder') {
      rootName = dirParts[0];
    }
    // Register every ancestor directory so intermediates that hold no direct
    // file (e.g. "Assets" above "Assets/Icons/logo.png") are still created.
    for (let i = 1; i <= dirParts.length; i++) {
      const path = dirParts.slice(0, i).join('/');
      if (!dirs.has(path)) {
        dirs.set(path, {
          path,
          name: dirParts[i - 1],
          parentPath: i === 1 ? null : dirParts.slice(0, i - 1).join('/'),
        });
      }
    }
    placements.push({ file, dirPath: dirParts.join('/') });
  }

  const all = [...dirs.values()];
  const maxDepth = all.reduce((m, d) => Math.max(m, d.path.split('/').length), 0);
  const levels: PlannedDir[][] = [];
  for (let depth = 1; depth <= maxDepth; depth++) {
    levels.push(all.filter((d) => d.path.split('/').length === depth));
  }

  return { rootName, levels, files: placements };
}
